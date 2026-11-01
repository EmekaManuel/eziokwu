// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockGD} from "./mocks/MockGD.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

abstract contract Base is Test {
    BountyBoard board;
    MockGD gd;
    MockIdentity identity;

    address owner = makeAddr("owner");
    address verifier = makeAddr("verifier");
    address ubi = makeAddr("ubi");
    address requester = makeAddr("requester");
    address relayer = makeAddr("relayer");

    uint256 aliceKey;
    address alice;
    uint256 bobKey;
    address bob;

    uint256 constant REWARD = 100e18;
    uint256 constant BOND = 10e18;
    uint16 constant FEE = 300; // 3%
    bytes32 constant SPEC = keccak256("spec");
    bytes32 constant ANSWER = keccak256("answer");

    function setUp() public virtual {
        (alice, aliceKey) = makeAddrAndKey("alice");
        (bob, bobKey) = makeAddrAndKey("bob");
        gd = new MockGD();
        identity = new MockIdentity();
        board = new BountyBoard(address(gd), address(identity), owner, verifier, ubi, FEE);

        identity.setRoot(alice, alice);
        identity.setRoot(bob, bob);

        _fund(requester);
        _fund(alice);
        _fund(bob);
    }

    function _fund(address who) internal {
        gd.mint(who, 10_000e18);
        vm.prank(who);
        gd.approve(address(board), type(uint256).max);
    }

    function _create(uint8 n, uint8 minTier) internal returns (uint256 id) {
        vm.prank(requester);
        id = board.createBounty(REWARD, n, BOND, minTier, uint64(block.timestamp + 2 days), SPEC);
    }

    function _claimSubmit(uint256 id, address w) internal {
        vm.startPrank(w);
        board.claim(id);
        board.submit(id, ANSWER);
        vm.stopPrank();
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", board.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
