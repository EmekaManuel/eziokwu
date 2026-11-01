// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IIdentity} from "./interfaces/IIdentity.sol";

/// @title BountyBoard
/// @notice Micro-bounties paid in G$ for real-world facts. Requesters (humans, apps or AI agents)
/// escrow rewards; GoodDollar-verified humans claim a slot by posting a bond, submit the hash of an
/// off-chain answer, and are paid once the requester or the VERIFIER resolves it.
/// @dev Money flow, per bounty with reward R, bond B, snapshot fee f:
///  - create:   requester -> contract   R * answersNeeded
///  - claim:    worker    -> contract   B
///  - accepted: contract  -> worker     R - R*f + B ; contract -> feeRecipient R*f
///  - rejected: contract  -> requester  B  if the VERIFIER rejects, -> feeRecipient if the requester
///              rejects its own bounty (no profit from rejecting honest work); R stays escrowed
///  - expired:  contract  -> worker     B           (slot freed)
///  - refund:   after the deadline, contract -> requester R for every slot with no claim on it
/// The contract's G$ balance therefore always equals
///   sum over bounties of R * (answersNeeded - accepted - refunded)  +  bonds of live claims.
/// No upgradeability, no loops over user-controlled data.
contract BountyBoard is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------------------

    enum ClaimState {
        None,
        Claimed, // slot held, bond posted, awaiting submission
        Submitted, // answer hash stored, awaiting resolution
        Accepted, // terminal: paid
        Rejected, // terminal: bond forfeited to requester
        Expired // terminal: slot freed, bond returned
    }

    struct Bounty {
        address requester;
        uint16 feeBps; // snapshot of feeBps at creation, so a worker's payout is known when claiming
        uint8 answersNeeded;
        uint8 minTier;
        uint8 accepted; // slots paid out
        uint8 active; // slots with a live claim (Claimed or Submitted)
        uint8 refunded; // slots whose reward went back to the requester
        uint64 deadline; // no new claims at/after this time; unfilled slots refundable from then
        uint256 reward; // per answer
        uint256 bond; // per claim
        bytes32 specHash; // hash of the off-chain task spec
    }

    struct Claim {
        ClaimState state;
        address root; // whitelisted root of the worker at claim time
        uint64 claimExpiry; // submit by this time
        uint64 submittedAt;
        bytes32 submissionHash;
    }

    struct Stats {
        uint32 accepted;
        uint32 rejected;
    }

    // ---------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------

    uint16 public constant MAX_FEE_BPS = 500; // 5%
    uint16 internal constant BPS = 10_000;
    uint8 public constant MAX_ANSWERS = 5;
    uint8 public constant MAX_TIER = 3;
    uint64 public constant MAX_DURATION = 90 days;
    uint64 public constant MIN_CLAIM_WINDOW = 10 minutes;
    uint64 public constant MAX_CLAIM_WINDOW = 7 days;
    uint64 public constant MIN_RESOLVE_WINDOW = 1 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 14 days;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(uint256 bountyId,address worker,uint256 nonce,uint256 deadline)");
    bytes32 public constant SUBMIT_TYPEHASH =
        keccak256("Submit(uint256 bountyId,address worker,bytes32 submissionHash,uint256 nonce,uint256 deadline)");

    // ---------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------

    IERC20 public immutable gd;
    IIdentity public immutable identity;

    address public verifier;
    address public feeRecipient;
    uint16 public feeBps;
    uint64 public claimWindow = 1 days;
    /// @notice After a worker submits, if nobody resolves within this window, anyone may settle the
    /// claim as accepted (see `settleStale`).
    uint64 public resolveWindow = 3 days;

    uint256 public nextBountyId = 1;
    mapping(uint256 bountyId => Bounty) public bounties;
    mapping(uint256 bountyId => mapping(address worker => Claim)) public claims;
    /// @notice One verified human (root) may hold only one claim per bounty, ever.
    mapping(uint256 bountyId => mapping(address root => bool)) public rootClaimed;
    mapping(address root => Stats) public stats;
    /// @notice Per-worker EIP-712 nonce, consumed by every claimFor / submitFor.
    mapping(address worker => uint256) public nonces;

    // ---------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed requester,
        uint256 rewardPerAnswer,
        uint8 answersNeeded,
        uint256 bondAmount,
        uint8 minTier,
        uint64 deadline,
        bytes32 specHash,
        uint16 feeBps
    );
    event Claimed(uint256 indexed bountyId, address indexed worker, address indexed root, uint64 claimExpiry);
    event Submitted(uint256 indexed bountyId, address indexed worker, bytes32 submissionHash);
    event Resolved(
        uint256 indexed bountyId,
        address indexed worker,
        address indexed root,
        bool accepted,
        address resolver,
        uint256 workerPayout, // reward - fee + bond when accepted, else 0
        uint256 fee, // sent to feeRecipient (accepted only)
        address bondTo, // who received the forfeited bond (rejected only)
        uint256 bondForfeited
    );
    event ClaimExpired(uint256 indexed bountyId, address indexed worker, uint256 bondReturned);
    event Refunded(uint256 indexed bountyId, address indexed requester, uint8 slots, uint256 amount);
    event ReputationUpdated(address indexed root, uint32 accepted, uint32 rejected, uint8 tier);

    event VerifierSet(address indexed verifier);
    event FeeRecipientSet(address indexed feeRecipient);
    event FeeBpsSet(uint16 feeBps);
    event ClaimWindowSet(uint64 claimWindow);
    event ResolveWindowSet(uint64 resolveWindow);

    // ---------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidParams();
    error FeeTooHigh();
    error UnknownBounty();
    error BountyClosed();
    error DeadlineNotReached();
    error NotVerified();
    error TierTooLow();
    error SelfClaim();
    error AlreadyClaimed();
    error RootAlreadyClaimed();
    error NoOpenSlot();
    error NotClaimed();
    error NotSubmitted();
    error ClaimNotExpired();
    error ClaimExpiredAlready();
    error ResolveWindowOpen();
    error NotAuthorized();
    error SignatureExpired();
    error InvalidSignature();
    error NothingToRefund();
    error TransferAmountMismatch();

    // ---------------------------------------------------------------------------------------
    // Construction & admin
    // ---------------------------------------------------------------------------------------

    /// @param gd_ G$ token (18 decimals).
    /// @param identity_ GoodDollar Identity contract.
    /// @param owner_ Admin (use a multisig; two-step transfer).
    /// @param verifier_ Backend address allowed to resolve any bounty (may be zero to disable).
    /// @param feeRecipient_ Receives the fee (the UBI pool; to be confirmed with GoodDollar).
    /// @param feeBps_ Fee in basis points, at most MAX_FEE_BPS.
    constructor(
        address gd_,
        address identity_,
        address owner_,
        address verifier_,
        address feeRecipient_,
        uint16 feeBps_
    ) Ownable(owner_) EIP712("Eziokwu BountyBoard", "1") {
        if (gd_ == address(0) || identity_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        gd = IERC20(gd_);
        identity = IIdentity(identity_);
        verifier = verifier_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        emit VerifierSet(verifier_);
        emit FeeRecipientSet(feeRecipient_);
        emit FeeBpsSet(feeBps_);
    }

    /// @notice Set the backend address that may resolve any bounty. Zero disables the role.
    function setVerifier(address verifier_) external onlyOwner {
        verifier = verifier_;
        emit VerifierSet(verifier_);
    }

    /// @notice Set where fees are sent. Applies to every payout from now on.
    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientSet(feeRecipient_);
    }

    /// @notice Set the fee for bounties created from now on. Existing bounties keep their snapshot.
    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeBpsSet(feeBps_);
    }

    /// @notice Set how long a worker has to submit after claiming. Applies to new claims.
    function setClaimWindow(uint64 claimWindow_) external onlyOwner {
        if (claimWindow_ < MIN_CLAIM_WINDOW || claimWindow_ > MAX_CLAIM_WINDOW) revert InvalidParams();
        claimWindow = claimWindow_;
        emit ClaimWindowSet(claimWindow_);
    }

    /// @notice Set how long a submission may sit unresolved before anyone can settle it as accepted.
    function setResolveWindow(uint64 resolveWindow_) external onlyOwner {
        if (resolveWindow_ < MIN_RESOLVE_WINDOW || resolveWindow_ > MAX_RESOLVE_WINDOW) revert InvalidParams();
        resolveWindow = resolveWindow_;
        emit ResolveWindowSet(resolveWindow_);
    }

    // ---------------------------------------------------------------------------------------
    // Requester
    // ---------------------------------------------------------------------------------------

    /// @notice Post a bounty and escrow `rewardPerAnswer * answersNeeded` G$. Caller needs no
    /// verification (AI agents are requesters) but must have approved this contract for the escrow.
    /// @param rewardPerAnswer G$ paid per accepted answer (before fee).
    /// @param answersNeeded Number of answers wanted, 1..MAX_ANSWERS.
    /// @param bondAmount G$ each worker must post to claim; 0 for none.
    /// @param minTier Minimum worker tier, 0..MAX_TIER.
    /// @param deadline Unix time after which no new claims are accepted; must be within MAX_DURATION.
    /// @param specHash Hash of the off-chain task specification.
    function createBounty(
        uint256 rewardPerAnswer,
        uint8 answersNeeded,
        uint256 bondAmount,
        uint8 minTier,
        uint64 deadline,
        bytes32 specHash
    ) external nonReentrant returns (uint256 bountyId) {
        if (
            rewardPerAnswer == 0 || answersNeeded == 0 || answersNeeded > MAX_ANSWERS || minTier > MAX_TIER
                || specHash == bytes32(0) || deadline <= block.timestamp || deadline > block.timestamp + MAX_DURATION
        ) revert InvalidParams();

        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            requester: msg.sender,
            feeBps: feeBps,
            answersNeeded: answersNeeded,
            minTier: minTier,
            accepted: 0,
            active: 0,
            refunded: 0,
            deadline: deadline,
            reward: rewardPerAnswer,
            bond: bondAmount,
            specHash: specHash
        });
        emit BountyCreated(
            bountyId, msg.sender, rewardPerAnswer, answersNeeded, bondAmount, minTier, deadline, specHash, feeBps
        );

        _pull(msg.sender, rewardPerAnswer * answersNeeded);
    }

    /// @notice After the deadline, return the reward of every slot that has no claim on it.
    /// Callable by anyone (funds only ever go to the requester) and repeatable: slots freed later by
    /// an expired claim or a rejection become refundable on the next call.
    function refundUnfilled(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (block.timestamp < b.deadline) revert DeadlineNotReached();

        uint8 slots = b.answersNeeded - b.accepted - b.active - b.refunded;
        if (slots == 0) revert NothingToRefund();

        b.refunded += slots;
        uint256 amount = b.reward * slots;
        emit Refunded(bountyId, b.requester, slots, amount);
        gd.safeTransfer(b.requester, amount);
    }

    // ---------------------------------------------------------------------------------------
    // Worker: direct calls
    // ---------------------------------------------------------------------------------------

    /// @notice Claim a slot as msg.sender. Posts the bond (needs prior G$ approval).
    function claim(uint256 bountyId) external nonReentrant {
        _claim(bountyId, msg.sender);
    }

    /// @notice Store the hash of the off-chain answer for a claim held by msg.sender.
    function submit(uint256 bountyId, bytes32 submissionHash) external nonReentrant {
        _submit(bountyId, msg.sender, submissionHash);
    }

    // ---------------------------------------------------------------------------------------
    // Worker: gasless (relayer submits, worker signs EIP-712)
    // ---------------------------------------------------------------------------------------

    /// @notice Claim on behalf of `worker` using their EIP-712 `Claim` signature. Anyone may relay.
    /// @dev The signature binds bountyId, worker, the worker's next nonce, and an expiry, so a relayer
    /// can neither alter, replay, nor act without the worker's consent.
    function claimFor(uint256 bountyId, address worker, uint256 sigDeadline, bytes calldata signature)
        external
        nonReentrant
    {
        _checkSignature(
            worker, sigDeadline, signature, keccak256(abi.encode(CLAIM_TYPEHASH, bountyId, worker, nonces[worker], sigDeadline))
        );
        _claim(bountyId, worker);
    }

    /// @notice Submit on behalf of `worker` using their EIP-712 `Submit` signature. Anyone may relay.
    function submitFor(
        uint256 bountyId,
        address worker,
        bytes32 submissionHash,
        uint256 sigDeadline,
        bytes calldata signature
    ) external nonReentrant {
        _checkSignature(
            worker,
            sigDeadline,
            signature,
            keccak256(abi.encode(SUBMIT_TYPEHASH, bountyId, worker, submissionHash, nonces[worker], sigDeadline))
        );
        _submit(bountyId, worker, submissionHash);
    }

    // ---------------------------------------------------------------------------------------
    // Resolution
    // ---------------------------------------------------------------------------------------

    /// @notice Accept or reject a submitted answer. Callable by the bounty's requester or the VERIFIER.
    function resolve(uint256 bountyId, address worker, bool accepted) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (msg.sender != b.requester && (verifier == address(0) || msg.sender != verifier)) revert NotAuthorized();
        Claim storage c = claims[bountyId][worker];
        if (c.state != ClaimState.Submitted) revert NotSubmitted();
        _settle(bountyId, b, c, worker, accepted);
    }

    /// @notice Liveness fallback: if a submission sits unresolved for `resolveWindow`, anyone can
    /// settle it as accepted, so a missing requester or verifier cannot trap a worker's reward/bond.
    function settleStale(uint256 bountyId, address worker) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        Claim storage c = claims[bountyId][worker];
        if (c.state != ClaimState.Submitted) revert NotSubmitted();
        if (block.timestamp <= c.submittedAt + resolveWindow) revert ResolveWindowOpen();
        _settle(bountyId, b, c, worker, true);
    }

    /// @notice Free a slot whose worker did not submit in time and return their bond. Callable by anyone.
    function expireClaim(uint256 bountyId, address worker) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        Claim storage c = claims[bountyId][worker];
        if (c.state != ClaimState.Claimed) revert NotClaimed();
        if (block.timestamp <= c.claimExpiry) revert ClaimNotExpired();

        c.state = ClaimState.Expired;
        b.active -= 1;
        uint256 bond = b.bond;
        emit ClaimExpired(bountyId, worker, bond);
        if (bond != 0) gd.safeTransfer(worker, bond);
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    /// @notice Worker tier as a function of a root's accepted/rejected counters.
    /// 3: >=100 accepted and rejects <=5% of accepted; 2: >=25 and <=10%; 1: >=5 and <=25%; else 0.
    function tierOf(address root) public view returns (uint8) {
        Stats memory s = stats[root];
        if (s.accepted >= 100 && uint256(s.rejected) * 20 <= s.accepted) return 3;
        if (s.accepted >= 25 && uint256(s.rejected) * 10 <= s.accepted) return 2;
        if (s.accepted >= 5 && uint256(s.rejected) * 4 <= s.accepted) return 1;
        return 0;
    }

    /// @notice Slots that could still be claimed right now (0 once the deadline has passed).
    function openSlots(uint256 bountyId) external view returns (uint8) {
        Bounty storage b = bounties[bountyId];
        if (b.requester == address(0) || block.timestamp >= b.deadline) return 0;
        return b.answersNeeded - b.accepted - b.active - b.refunded;
    }

    /// @notice EIP-712 domain separator, for off-chain signers.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------

    function _bounty(uint256 bountyId) internal view returns (Bounty storage b) {
        b = bounties[bountyId];
        if (b.requester == address(0)) revert UnknownBounty();
    }

    function _checkSignature(address worker, uint256 sigDeadline, bytes calldata signature, bytes32 structHash)
        internal
    {
        if (block.timestamp > sigDeadline) revert SignatureExpired();
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != worker) revert InvalidSignature();
        nonces[worker]++;
    }

    function _claim(uint256 bountyId, address worker) internal {
        Bounty storage b = _bounty(bountyId);
        if (block.timestamp >= b.deadline) revert BountyClosed();
        if (worker == b.requester) revert SelfClaim();
        Claim storage c = claims[bountyId][worker];
        if (c.state != ClaimState.None) revert AlreadyClaimed();

        address root = identity.getWhitelistedRoot(worker);
        if (root == address(0)) revert NotVerified();
        if (rootClaimed[bountyId][root]) revert RootAlreadyClaimed();
        if (tierOf(root) < b.minTier) revert TierTooLow();
        if (b.accepted + b.active + b.refunded >= b.answersNeeded) revert NoOpenSlot();

        rootClaimed[bountyId][root] = true;
        b.active += 1;
        uint64 expiry = uint64(block.timestamp) + claimWindow;
        c.state = ClaimState.Claimed;
        c.root = root;
        c.claimExpiry = expiry;
        emit Claimed(bountyId, worker, root, expiry);

        _pull(worker, b.bond);
    }

    function _submit(uint256 bountyId, address worker, bytes32 submissionHash) internal {
        _bounty(bountyId);
        Claim storage c = claims[bountyId][worker];
        if (c.state != ClaimState.Claimed) revert NotClaimed();
        if (block.timestamp > c.claimExpiry) revert ClaimExpiredAlready();
        if (submissionHash == bytes32(0)) revert InvalidParams();

        c.state = ClaimState.Submitted;
        c.submittedAt = uint64(block.timestamp);
        c.submissionHash = submissionHash;
        emit Submitted(bountyId, worker, submissionHash);
    }

    function _settle(uint256 bountyId, Bounty storage b, Claim storage c, address worker, bool accepted) internal {
        address root = c.root;
        Stats storage s = stats[root];
        b.active -= 1;
        uint256 bond = b.bond;

        uint256 workerPayout;
        uint256 fee;
        address bondTo;
        uint256 bondForfeited;
        if (accepted) {
            c.state = ClaimState.Accepted;
            b.accepted += 1;
            s.accepted += 1;
            fee = (b.reward * b.feeBps) / BPS;
            workerPayout = b.reward - fee + bond;
        } else {
            c.state = ClaimState.Rejected;
            s.rejected += 1;
            // A requester rejecting its own bounty must not profit from the bond (otherwise external
            // requesters could reject honest work to pocket bonds): it goes to the UBI pool instead.
            // A VERIFIER rejection compensates the requester for the junk answer.
            bondForfeited = bond;
            bondTo = msg.sender == b.requester ? feeRecipient : b.requester;
        }

        emit Resolved(bountyId, worker, root, accepted, msg.sender, workerPayout, fee, bondTo, bondForfeited);
        emit ReputationUpdated(root, s.accepted, s.rejected, tierOf(root));

        if (workerPayout != 0) gd.safeTransfer(worker, workerPayout);
        if (fee != 0) gd.safeTransfer(feeRecipient, fee);
        if (bondForfeited != 0) gd.safeTransfer(bondTo, bondForfeited);
    }

    /// @dev Pull exactly `amount` G$ from `from`; reverts if the token delivers a different amount
    /// (e.g. a transfer fee), which would silently break the escrow accounting.
    function _pull(address from, uint256 amount) internal {
        if (amount == 0) return;
        uint256 before = gd.balanceOf(address(this));
        gd.safeTransferFrom(from, address(this), amount);
        if (gd.balanceOf(address(this)) - before != amount) revert TransferAmountMismatch();
    }
}
