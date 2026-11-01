// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {BountyBoard} from "../src/BountyBoard.sol";

contract BountyBoardTest is Base {
    // ----- create -----

    function test_create_escrowsAndStores() public {
        uint256 id = _create(3, 0);
        assertEq(id, 1);
        assertEq(gd.balanceOf(address(board)), 3 * REWARD);
        (address req,, uint8 n,,,,, uint64 dl, uint256 rw, uint256 bd, bytes32 sh) = board.bounties(id);
        assertEq(req, requester);
        assertEq(n, 3);
        assertEq(rw, REWARD);
        assertEq(bd, BOND);
        assertEq(sh, SPEC);
        assertEq(dl, block.timestamp + 2 days);
    }

    function test_create_requesterNeedsNoVerification() public {
        assertEq(identity.roots(requester), address(0));
        _create(1, 0); // does not revert
    }

    function test_create_invalidParamsReverts() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.startPrank(requester);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(0, 1, BOND, 0, dl, SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 0, BOND, 0, dl, SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 6, BOND, 0, dl, SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 1, BOND, 4, dl, SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 1, BOND, 0, uint64(block.timestamp), SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 1, BOND, 0, uint64(block.timestamp + 91 days), SPEC);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.createBounty(REWARD, 1, BOND, 0, dl, bytes32(0));
        vm.stopPrank();
    }

    // ----- claim -----

    function test_claim_takesBondAndSlot() public {
        uint256 id = _create(2, 0);
        vm.prank(alice);
        board.claim(id);
        assertEq(gd.balanceOf(address(board)), 2 * REWARD + BOND);
        assertEq(board.openSlots(id), 1);
        (BountyBoard.ClaimState st, address root,,,) = board.claims(id, alice);
        assertEq(uint8(st), uint8(BountyBoard.ClaimState.Claimed));
        assertEq(root, alice);
    }

    function test_claim_unverifiedReverts() public {
        uint256 id = _create(1, 0);
        address stranger = makeAddr("stranger");
        _fund(stranger);
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotVerified.selector);
        board.claim(id);
    }

    function test_claim_connectedWalletWorksAndSharesRoot() public {
        uint256 id = _create(2, 0);
        address phone = makeAddr("phone"); // connected wallet of alice: root != itself
        _fund(phone);
        identity.setRoot(phone, alice);

        vm.prank(phone);
        board.claim(id);
        (, address root,,,) = board.claims(id, phone);
        assertEq(root, alice);

        // alice's primary wallet is the same human: second slot denied
        vm.prank(alice);
        vm.expectRevert(BountyBoard.RootAlreadyClaimed.selector);
        board.claim(id);
    }

    function test_claim_sameWorkerTwiceReverts() public {
        uint256 id = _create(2, 0);
        vm.startPrank(alice);
        board.claim(id);
        vm.expectRevert(BountyBoard.AlreadyClaimed.selector);
        board.claim(id);
        vm.stopPrank();
    }

    function test_claim_noOpenSlotReverts() public {
        uint256 id = _create(1, 0);
        vm.prank(alice);
        board.claim(id);
        vm.prank(bob);
        vm.expectRevert(BountyBoard.NoOpenSlot.selector);
        board.claim(id);
    }

    function test_claim_afterDeadlineReverts() public {
        uint256 id = _create(1, 0);
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.BountyClosed.selector);
        board.claim(id);
    }

    function test_claim_requesterCannotClaimOwn() public {
        uint256 id = _create(1, 0);
        identity.setRoot(requester, requester);
        vm.prank(requester);
        vm.expectRevert(BountyBoard.SelfClaim.selector);
        board.claim(id);
    }

    function test_claim_unknownBountyReverts() public {
        vm.prank(alice);
        vm.expectRevert(BountyBoard.UnknownBounty.selector);
        board.claim(99);
    }

    function test_claim_tierGate() public {
        uint256 id = _create(1, 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.TierTooLow.selector);
        board.claim(id);
    }

    // ----- submit -----

    function test_submit_storesHash() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        (BountyBoard.ClaimState st,,, uint64 at, bytes32 h) = board.claims(id, alice);
        assertEq(uint8(st), uint8(BountyBoard.ClaimState.Submitted));
        assertEq(h, ANSWER);
        assertEq(at, block.timestamp);
    }

    function test_submit_withoutClaimReverts() public {
        uint256 id = _create(1, 0);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotClaimed.selector);
        board.submit(id, ANSWER);
    }

    function test_submit_afterClaimWindowReverts() public {
        uint256 id = _create(1, 0);
        vm.prank(alice);
        board.claim(id);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.ClaimExpiredAlready.selector);
        board.submit(id, ANSWER);
    }

    function test_submit_twiceReverts() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotClaimed.selector);
        board.submit(id, ANSWER);
    }

    function test_submit_zeroHashReverts() public {
        uint256 id = _create(1, 0);
        vm.startPrank(alice);
        board.claim(id);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.submit(id, bytes32(0));
        vm.stopPrank();
    }

    // ----- resolve -----

    function test_resolve_acceptedByVerifier_paysWorkerFeeAndBond() public {
        uint256 id = _create(1, 0);
        uint256 before = gd.balanceOf(alice);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);

        uint256 fee = (REWARD * FEE) / 10_000;
        assertEq(gd.balanceOf(alice), before + REWARD - fee); // bond returned, reward net of fee
        assertEq(gd.balanceOf(ubi), fee);
        assertEq(gd.balanceOf(address(board)), 0);
        (uint32 acc, uint32 rej) = board.stats(alice);
        assertEq(acc, 1);
        assertEq(rej, 0);
    }

    function test_resolve_acceptedByRequester() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.prank(requester);
        board.resolve(id, alice, true);
        (BountyBoard.ClaimState st,,,,) = board.claims(id, alice);
        assertEq(uint8(st), uint8(BountyBoard.ClaimState.Accepted));
    }

    function test_resolve_rejected_bondToRequester_slotReopens() public {
        uint256 id = _create(1, 0);
        uint256 reqBefore = gd.balanceOf(requester);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, false);

        assertEq(gd.balanceOf(requester), reqBefore + BOND);
        assertEq(gd.balanceOf(address(board)), REWARD); // reward still escrowed
        assertEq(board.openSlots(id), 1);
        (, uint32 rej) = board.stats(alice);
        assertEq(rej, 1);

        // rejected human cannot retake the slot; someone else can
        vm.prank(alice);
        vm.expectRevert(BountyBoard.AlreadyClaimed.selector);
        board.claim(id);
        _claimSubmit(id, bob);
    }

    function test_resolve_rejectedByRequester_bondGoesToUbiNotRequester() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        uint256 reqBefore = gd.balanceOf(requester);
        vm.prank(requester);
        board.resolve(id, alice, false);
        assertEq(gd.balanceOf(requester), reqBefore);
        assertEq(gd.balanceOf(ubi), BOND);
    }

    function test_resolve_unauthorizedReverts() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.prank(bob);
        vm.expectRevert(BountyBoard.NotAuthorized.selector);
        board.resolve(id, alice, true);
        vm.prank(alice); // workers cannot resolve themselves
        vm.expectRevert(BountyBoard.NotAuthorized.selector);
        board.resolve(id, alice, true);
    }

    function test_resolve_beforeSubmitReverts() public {
        uint256 id = _create(1, 0);
        vm.prank(alice);
        board.claim(id);
        vm.prank(verifier);
        vm.expectRevert(BountyBoard.NotSubmitted.selector);
        board.resolve(id, alice, true);
    }

    function test_resolve_twiceReverts() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.startPrank(verifier);
        board.resolve(id, alice, true);
        vm.expectRevert(BountyBoard.NotSubmitted.selector);
        board.resolve(id, alice, false);
        vm.stopPrank();
    }

    function test_resolve_verifierDisabledWhenZero() public {
        vm.prank(owner);
        board.setVerifier(address(0));
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.prank(address(0));
        vm.expectRevert(BountyBoard.NotAuthorized.selector);
        board.resolve(id, alice, true);
    }

    function test_feeIsSnapshotAtCreation() public {
        uint256 id = _create(1, 0);
        vm.prank(owner);
        board.setFeeBps(500);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);
        assertEq(gd.balanceOf(ubi), (REWARD * FEE) / 10_000);
    }

    // ----- stale / expiry / refund -----

    function test_settleStale() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.expectRevert(BountyBoard.ResolveWindowOpen.selector);
        board.settleStale(id, alice);
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(relayer);
        board.settleStale(id, alice);
        (BountyBoard.ClaimState st,,,,) = board.claims(id, alice);
        assertEq(uint8(st), uint8(BountyBoard.ClaimState.Accepted));
    }

    function test_expireClaim_returnsBondFreesSlot() public {
        uint256 id = _create(1, 0);
        uint256 before = gd.balanceOf(alice);
        vm.prank(alice);
        board.claim(id);

        vm.expectRevert(BountyBoard.ClaimNotExpired.selector);
        board.expireClaim(id, alice);

        vm.warp(block.timestamp + 1 days + 1);
        board.expireClaim(id, alice);
        assertEq(gd.balanceOf(alice), before);
        assertEq(board.openSlots(id), 1);
    }

    function test_expireClaim_submittedCannotExpire() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(BountyBoard.NotClaimed.selector);
        board.expireClaim(id, alice);
    }

    function test_refund_afterDeadline_unfilledSlots() public {
        uint256 id = _create(3, 0);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);

        vm.expectRevert(BountyBoard.DeadlineNotReached.selector);
        board.refundUnfilled(id);

        uint256 before = gd.balanceOf(requester);
        vm.warp(block.timestamp + 2 days);
        board.refundUnfilled(id);
        assertEq(gd.balanceOf(requester), before + 2 * REWARD);
        assertEq(gd.balanceOf(address(board)), 0);

        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refundUnfilled(id);
    }

    function test_refund_heldBackWhileClaimLive_thenReleasedOnExpiry() public {
        uint256 id = _create(1, 0);
        vm.warp(block.timestamp + 2 days - 1);
        vm.prank(alice);
        board.claim(id); // claimed just before deadline, window runs past it
        vm.warp(block.timestamp + 2);
        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refundUnfilled(id);

        vm.warp(block.timestamp + 1 days);
        board.expireClaim(id, alice);
        board.refundUnfilled(id);
        assertEq(gd.balanceOf(address(board)), 0);
    }

    function test_refund_afterRejectionPastDeadline() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.warp(block.timestamp + 2 days);
        vm.prank(verifier);
        board.resolve(id, alice, false);
        board.refundUnfilled(id);
        assertEq(gd.balanceOf(address(board)), 0);
    }

    // ----- tiers -----

    function test_tier_progression() public {
        assertEq(board.tierOf(alice), 0);
        for (uint256 i; i < 5; i++) {
            uint256 id = _create(1, 0);
            _claimSubmit(id, alice);
            vm.prank(verifier);
            board.resolve(id, alice, true);
        }
        assertEq(board.tierOf(alice), 1);

        // can now take a tier-1 bounty
        uint256 gated = _create(1, 1);
        _claimSubmit(gated, alice);
    }

    function test_tier_rejectionsLowerIt() public {
        for (uint256 i; i < 5; i++) {
            uint256 id = _create(1, 0);
            _claimSubmit(id, alice);
            vm.prank(verifier);
            board.resolve(id, alice, true);
        }
        assertEq(board.tierOf(alice), 1);
        for (uint256 i; i < 2; i++) {
            uint256 id = _create(1, 0);
            _claimSubmit(id, alice);
            vm.prank(verifier);
            board.resolve(id, alice, false);
        }
        // 5 accepted, 2 rejected: 2*4 > 5 -> back to tier 0
        assertEq(board.tierOf(alice), 0);
    }

    function testFuzz_tier_neverAboveMaxAndMonotoneInAccepts(uint32 acc, uint32 rej) public {
        // exercise the pure thresholds through storage
        vm.store(address(board), _statsSlot(alice), bytes32(uint256(acc) | (uint256(rej) << 32)));
        uint8 t = board.tierOf(alice);
        assertLe(t, 3);
        if (t == 3) assertTrue(acc >= 100 && uint256(rej) * 20 <= acc);
        if (t == 0) assertTrue(!(acc >= 5 && uint256(rej) * 4 <= acc));
    }

    /// @dev `stats` mapping slot per `forge inspect BountyBoard storageLayout`.
    function _statsSlot(address root) internal pure returns (bytes32) {
        return keccak256(abi.encode(root, uint256(12)));
    }

    // ----- gasless EIP-712 -----

    function _claimSig(uint256 pk, uint256 id, address w, uint256 nonce, uint256 exp) internal view returns (bytes memory) {
        return _sign(pk, keccak256(abi.encode(board.CLAIM_TYPEHASH(), id, w, nonce, exp)));
    }

    function _submitSig(uint256 pk, uint256 id, address w, bytes32 h, uint256 nonce, uint256 exp)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, keccak256(abi.encode(board.SUBMIT_TYPEHASH(), id, w, h, nonce, exp)));
    }

    function test_claimFor_submitFor_happyPath() public {
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;

        bytes memory s1 = _claimSig(aliceKey, id, alice, 0, exp);
        vm.prank(relayer);
        board.claimFor(id, alice, exp, s1);
        assertEq(board.nonces(alice), 1);

        bytes memory s2 = _submitSig(aliceKey, id, alice, ANSWER, 1, exp);
        vm.prank(relayer);
        board.submitFor(id, alice, ANSWER, exp, s2);
        assertEq(board.nonces(alice), 2);

        (BountyBoard.ClaimState st,,,,) = board.claims(id, alice);
        assertEq(uint8(st), uint8(BountyBoard.ClaimState.Submitted));
    }

    function test_claimFor_replayReverts() public {
        uint256 id = _create(2, 0);
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(aliceKey, id, alice, 0, exp);
        board.claimFor(id, alice, exp, s);
        vm.expectRevert(BountyBoard.InvalidSignature.selector); // nonce moved on
        board.claimFor(id, alice, exp, s);
    }

    function test_claimFor_wrongSignerReverts() public {
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(bobKey, id, alice, 0, exp); // bob signs for alice
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.claimFor(id, alice, exp, s);
    }

    function test_claimFor_tamperedBountyReverts() public {
        uint256 id = _create(1, 0);
        uint256 id2 = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(aliceKey, id, alice, 0, exp);
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.claimFor(id2, alice, exp, s);
    }

    function test_claimFor_expiredSignatureReverts() public {
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(aliceKey, id, alice, 0, exp);
        vm.warp(exp + 1);
        vm.expectRevert(BountyBoard.SignatureExpired.selector);
        board.claimFor(id, alice, exp, s);
    }

    function test_claimFor_garbageSignatureReverts() public {
        uint256 id = _create(1, 0);
        vm.expectRevert();
        board.claimFor(id, alice, block.timestamp + 1, hex"1234");
    }

    function test_submitFor_hashIsBoundToSignature() public {
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        board.claimFor(id, alice, exp, _claimSig(aliceKey, id, alice, 0, exp));
        bytes memory s = _submitSig(aliceKey, id, alice, ANSWER, 1, exp);
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.submitFor(id, alice, keccak256("other"), exp, s);
    }

    function test_signatureIsNotCrossUsable_claimVsSubmit() public {
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        board.claimFor(id, alice, exp, _claimSig(aliceKey, id, alice, 0, exp));
        // a Claim signature cannot be passed off as a Submit
        bytes memory s = _claimSig(aliceKey, id, alice, 1, exp);
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.submitFor(id, alice, ANSWER, exp, s);
    }

    function test_directCallsDoNotConsumeNonce() public {
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        assertEq(board.nonces(alice), 0);
    }

    function test_claimFor_failedClaimDoesNotBurnNonce() public {
        uint256 id = _create(1, 1); // alice is tier 0 -> TierTooLow
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(aliceKey, id, alice, 0, exp);
        vm.expectRevert(BountyBoard.TierTooLow.selector);
        board.claimFor(id, alice, exp, s);
        assertEq(board.nonces(alice), 0);
    }

    function test_claimFor_requiresWorkerApproval() public {
        address carol;
        uint256 carolKey;
        (carol, carolKey) = makeAddrAndKey("carol");
        identity.setRoot(carol, carol);
        gd.mint(carol, 1000e18); // funded but never approved
        uint256 id = _create(1, 0);
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(carolKey, id, carol, 0, exp);
        vm.expectRevert();
        board.claimFor(id, carol, exp, s);
    }

    // ----- admin -----

    function test_admin_onlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        board.setVerifier(alice);
        vm.expectRevert();
        board.setFeeRecipient(alice);
        vm.expectRevert();
        board.setFeeBps(1);
        vm.expectRevert();
        board.setClaimWindow(1 hours);
        vm.expectRevert();
        board.setResolveWindow(2 days);
        vm.stopPrank();
    }

    function test_admin_feeCapAndBounds() public {
        vm.startPrank(owner);
        vm.expectRevert(BountyBoard.FeeTooHigh.selector);
        board.setFeeBps(501);
        board.setFeeBps(500);
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        board.setFeeRecipient(address(0));
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.setClaimWindow(1 minutes);
        vm.expectRevert(BountyBoard.InvalidParams.selector);
        board.setResolveWindow(30 days);
        vm.stopPrank();
    }

    function test_constructor_rejectsBadFeeAndZeroes() public {
        vm.expectRevert(BountyBoard.FeeTooHigh.selector);
        new BountyBoard(address(gd), address(identity), owner, verifier, ubi, 501);
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(address(gd), address(identity), owner, verifier, address(0), 100);
    }

    function test_ownershipIsTwoStep() public {
        vm.prank(owner);
        board.transferOwnership(alice);
        assertEq(board.owner(), owner);
        vm.prank(alice);
        board.acceptOwnership();
        assertEq(board.owner(), alice);
    }

    function test_feeRecipientChangeAppliesToLaterPayouts() public {
        address ubi2 = makeAddr("ubi2");
        vm.prank(owner);
        board.setFeeRecipient(ubi2);
        uint256 id = _create(1, 0);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);
        assertEq(gd.balanceOf(ubi2), (REWARD * FEE) / 10_000);
        assertEq(gd.balanceOf(ubi), 0);
    }

    function test_zeroFeeAndZeroBond() public {
        vm.prank(owner);
        board.setFeeBps(0);
        vm.prank(requester);
        uint256 id = board.createBounty(REWARD, 1, 0, 0, uint64(block.timestamp + 1 days), SPEC);
        uint256 before = gd.balanceOf(alice);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);
        assertEq(gd.balanceOf(alice), before + REWARD);
        assertEq(gd.balanceOf(ubi), 0);
    }

    // ----- fuzz -----

    /// Accepted payout splits exactly: worker + fee == reward + bond, fee <= 5% of reward.
    function testFuzz_acceptedPayoutConserves(uint96 reward, uint96 bond, uint16 fee) public {
        reward = uint96(bound(reward, 1, 1_000_000e18));
        bond = uint96(bound(bond, 0, 1_000_000e18));
        fee = uint16(bound(fee, 0, 500));
        vm.prank(owner);
        board.setFeeBps(fee);
        gd.mint(requester, reward);
        gd.mint(alice, bond);

        vm.prank(requester);
        uint256 id = board.createBounty(reward, 1, bond, 0, uint64(block.timestamp + 1 days), SPEC);
        uint256 aliceBefore = gd.balanceOf(alice);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, true);

        uint256 feePaid = gd.balanceOf(ubi);
        assertLe(feePaid, (uint256(reward) * 500) / 10_000);
        assertEq(gd.balanceOf(alice) - aliceBefore + feePaid, reward);
        assertEq(gd.balanceOf(address(board)), 0);
    }

    /// Rejection: requester ends up with the bond, nothing is lost.
    function testFuzz_rejectedBondGoesToRequester(uint96 reward, uint96 bond) public {
        reward = uint96(bound(reward, 1, 1_000_000e18));
        bond = uint96(bound(bond, 0, 1_000_000e18));
        gd.mint(requester, reward);
        gd.mint(alice, bond);
        vm.prank(requester);
        uint256 id = board.createBounty(reward, 1, bond, 0, uint64(block.timestamp + 1 days), SPEC);
        uint256 reqBefore = gd.balanceOf(requester);
        _claimSubmit(id, alice);
        vm.prank(verifier);
        board.resolve(id, alice, false);
        assertEq(gd.balanceOf(requester), reqBefore + bond);
        assertEq(gd.balanceOf(address(board)), reward);
    }

    /// A relayer holding a signature for one bounty cannot claim any other.
    function testFuzz_signatureBoundToBounty(uint8 other) public {
        uint256 id = _create(1, 0);
        uint256 id2 = _create(1, 0);
        other = uint8(bound(other, 3, 255));
        uint256 exp = block.timestamp + 1 hours;
        bytes memory s = _claimSig(aliceKey, id, alice, 0, exp);
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.claimFor(other, alice, exp, s);
        vm.expectRevert(BountyBoard.InvalidSignature.selector);
        board.claimFor(id2, alice, exp, s);
    }
}
