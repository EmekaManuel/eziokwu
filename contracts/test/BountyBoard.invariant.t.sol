// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockGD} from "./mocks/MockGD.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

/// @dev Drives random sequences of every state-changing action. Reverts are expected and ignored
/// (fail_on_revert = false); only the invariants below must hold after each call.
contract Handler is Test {
    BountyBoard public board;
    MockGD public gd;
    MockIdentity public identity;

    address public verifier;
    address public requester;
    address[] public workers;

    uint256 public constant MAX_BOUNTIES = 12;
    /// ghost: total G$ ever minted into the system
    uint256 public minted;
    /// every (bounty, worker) pair that successfully claimed; later actions pick from these so
    /// the fuzzer reaches submit/resolve/expire instead of guessing matching ids
    uint256[] public claimedIds;
    address[] public claimedWorkers;

    constructor(BountyBoard b, MockGD g, MockIdentity i, address v, address r, address[] memory w) {
        board = b;
        gd = g;
        identity = i;
        verifier = v;
        requester = r;
        workers = w;
    }

    function workerCount() external view returns (uint256) {
        return workers.length;
    }

    function create(uint96 reward, uint8 n, uint96 bond, uint8 tier, uint32 dur) external {
        if (board.nextBountyId() > MAX_BOUNTIES) return;
        reward = uint96(bound(reward, 1, 1000e18));
        bond = uint96(bound(bond, 0, 500e18));
        n = uint8(bound(n, 1, 5));
        tier = uint8(bound(tier, 0, 1));
        dur = uint32(bound(dur, 1 hours, 30 days));
        gd.mint(requester, uint256(reward) * n);
        minted += uint256(reward) * n;
        vm.prank(requester);
        board.createBounty(reward, n, bond, tier, uint64(block.timestamp + dur), keccak256(abi.encode(reward, n, dur)));
    }

    function claim(uint256 id, uint256 w) external {
        address who = _worker(w);
        id = _id(id);
        (,,,,,,,, , uint256 bond,) = board.bounties(id);
        gd.mint(who, bond);
        minted += bond;
        vm.prank(who);
        try board.claim(id) {
            claimedIds.push(id);
            claimedWorkers.push(who);
        } catch {}
    }

    function submit(uint256 pick) external {
        (uint256 id, address who) = _pickClaim(pick);
        vm.prank(who);
        try board.submit(id, keccak256(abi.encode(id, who))) {} catch {}
    }

    function resolve(uint256 pick, bool accept, bool byVerifier) external {
        (uint256 id, address who) = _pickClaim(pick);
        vm.prank(byVerifier ? verifier : requester);
        try board.resolve(id, who, accept) {} catch {}
    }

    function settleStale(uint256 pick) external {
        (uint256 id, address who) = _pickClaim(pick);
        try board.settleStale(id, who) {} catch {}
    }

    function expireClaim(uint256 pick) external {
        (uint256 id, address who) = _pickClaim(pick);
        try board.expireClaim(id, who) {} catch {}
    }

    function refund(uint256 id) external {
        try board.refundUnfilled(_id(id)) {} catch {}
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 5 days));
    }

    function _pickClaim(uint256 pick) internal view returns (uint256, address) {
        if (claimedIds.length == 0) return (1, workers[0]);
        uint256 i = pick % claimedIds.length;
        return (claimedIds[i], claimedWorkers[i]);
    }

    function _worker(uint256 w) internal view returns (address) {
        return workers[w % workers.length];
    }

    function _id(uint256 id) internal view returns (uint256) {
        uint256 next = board.nextBountyId();
        return next <= 1 ? 1 : 1 + (id % (next - 1));
    }
}

contract BountyBoardInvariantTest is Test {
    BountyBoard board;
    MockGD gd;
    MockIdentity identity;
    Handler handler;

    address verifier = makeAddr("verifier");
    address ubi = makeAddr("ubi");
    address requester = makeAddr("requester");

    function setUp() public {
        gd = new MockGD();
        identity = new MockIdentity();
        board = new BountyBoard(address(gd), address(identity), makeAddr("owner"), verifier, ubi, 300);

        address[] memory ws = new address[](4);
        for (uint256 i; i < ws.length; i++) {
            ws[i] = makeAddr(string.concat("w", vm.toString(i)));
            identity.setRoot(ws[i], ws[i]);
        }
        // workers 2 and 3 are two wallets of the same human (shared root)
        identity.setRoot(ws[3], ws[2]);

        handler = new Handler(board, gd, identity, verifier, requester, ws);
        for (uint256 i; i < ws.length; i++) {
            vm.prank(ws[i]);
            gd.approve(address(board), type(uint256).max);
        }
        vm.prank(requester);
        gd.approve(address(board), type(uint256).max);

        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](8);
        sel[0] = Handler.create.selector;
        sel[1] = Handler.claim.selector;
        sel[2] = Handler.submit.selector;
        sel[3] = Handler.resolve.selector;
        sel[4] = Handler.settleStale.selector;
        sel[5] = Handler.expireClaim.selector;
        sel[6] = Handler.refund.selector;
        sel[7] = Handler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    /// Contract G$ balance == escrowed rewards + bonds held by live claims.
    function invariant_balanceEqualsEscrowPlusBonds() public view {
        uint256 expected;
        uint256 last = board.nextBountyId();
        uint256 nWorkers = handler.workerCount();
        for (uint256 id = 1; id < last; id++) {
            (,, uint8 n,, uint8 acc,, uint8 refunded,, uint256 reward, uint256 bond,) = board.bounties(id);
            expected += reward * (n - acc - refunded);
            for (uint256 w; w < nWorkers; w++) {
                (BountyBoard.ClaimState st,,,,) = board.claims(id, handler.workers(w));
                if (st == BountyBoard.ClaimState.Claimed || st == BountyBoard.ClaimState.Submitted) expected += bond;
            }
        }
        assertEq(gd.balanceOf(address(board)), expected, "balance != escrow + bonds");
    }

    /// accepted + active + refunded never exceeds answersNeeded, and `active` matches live claims.
    function invariant_slotAccounting() public view {
        uint256 last = board.nextBountyId();
        uint256 nWorkers = handler.workerCount();
        for (uint256 id = 1; id < last; id++) {
            (,, uint8 n,, uint8 acc, uint8 active, uint8 refunded,,,,) = board.bounties(id);
            assertLe(uint256(acc) + active + refunded, n, "slots overbooked");
            uint8 live;
            uint8 accepted;
            for (uint256 w; w < nWorkers; w++) {
                (BountyBoard.ClaimState st,,,,) = board.claims(id, handler.workers(w));
                if (st == BountyBoard.ClaimState.Claimed || st == BountyBoard.ClaimState.Submitted) live++;
                if (st == BountyBoard.ClaimState.Accepted) accepted++;
            }
            assertEq(live, active, "active != live claims");
            assertEq(accepted, acc, "accepted != accepted claims");
        }
    }

    /// One verified human (root) holds at most one non-expired claim per bounty.
    function invariant_oneRootOnePerBounty() public view {
        uint256 last = board.nextBountyId();
        for (uint256 id = 1; id < last; id++) {
            uint256 sharedRootClaims;
            for (uint256 w = 2; w < 4; w++) {
                (BountyBoard.ClaimState st,,,,) = board.claims(id, handler.workers(w));
                if (st != BountyBoard.ClaimState.None) sharedRootClaims++;
            }
            assertLe(sharedRootClaims, 1, "same human filled two slots");
        }
    }

    /// Value is conserved: nobody can create or destroy G$ through the board.
    function invariant_supplyConserved() public view {
        assertEq(gd.totalSupply(), handler.minted());
    }
}
