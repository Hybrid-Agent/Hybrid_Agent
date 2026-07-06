// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MandateRegistry} from "./MandateRegistry.sol";

/// @title HybridEscrow
/// @notice Full-settlement escrow for property/vehicle sales, denominated in USDC.
///         The buyer funds the full price into the contract; on completion the
///         contract atomically splits the funds:
///           - agent  receives the commission   (only for agent-brokered deals)
///           - platform receives its fee
///           - seller receives the remainder
///         Because the seller can never receive their proceeds without the
///         commission being carved out in the same transaction, an agent cannot
///         be cheated out of an agreed commission.
contract HybridEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DealState {
        None,
        Created,
        Funded,
        Completed,
        Disputed,
        Cancelled
    }

    struct Deal {
        address buyer;
        address seller; // the owner
        address agent; // address(0) for owner-direct sales
        uint256 price; // USDC base units (6 decimals)
        uint16 commissionBps; // snapshot from the mandate (0 for owner-direct)
        uint16 platformFeeBps; // snapshot at creation time
        uint256 mandateId; // 0 for owner-direct
        bytes32 listingRef;
        DealState state;
        uint64 fundedAt;
        uint64 disputeDeadline;
    }

    uint16 public constant MAX_PLATFORM_FEE_BPS = 1000; // 10%

    IERC20 public immutable usdc;
    MandateRegistry public immutable mandates;

    uint16 public platformFeeBps;
    address public feeRecipient;
    address public arbiter;
    uint64 public disputeWindow = 7 days;

    /// @notice Platform fees accumulate here and can only be withdrawn by the
    ///         contract owner (the deployer).
    uint256 public accruedFees;

    uint256 public nextDealId = 1;
    mapping(uint256 => Deal) private _deals;

    event DealCreated(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        address agent,
        uint256 price,
        uint16 commissionBps,
        uint16 platformFeeBps,
        bytes32 listingRef,
        uint256 mandateId
    );
    event DealFunded(uint256 indexed id, address indexed buyer, uint256 price, uint64 disputeDeadline);
    event DealCompleted(uint256 indexed id, uint256 proceeds, uint256 commission, uint256 fee);
    event DealDisputed(uint256 indexed id, address indexed by);
    event DealRefunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event DealCancelled(uint256 indexed id);

    event PlatformFeeUpdated(uint16 bps);
    event FeeRecipientUpdated(address recipient);
    event ArbiterUpdated(address arbiter);
    event DisputeWindowUpdated(uint64 window);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(
        address usdc_,
        address mandates_,
        address feeRecipient_,
        uint16 platformFeeBps_,
        address arbiter_
    ) Ownable(msg.sender) {
        require(
            usdc_ != address(0) &&
                mandates_ != address(0) &&
                feeRecipient_ != address(0) &&
                arbiter_ != address(0),
            "zero address"
        );
        require(platformFeeBps_ <= MAX_PLATFORM_FEE_BPS, "fee too high");
        usdc = IERC20(usdc_);
        mandates = MandateRegistry(mandates_);
        feeRecipient = feeRecipient_;
        platformFeeBps = platformFeeBps_;
        arbiter = arbiter_;
    }

    // ---------------------------------------------------------------------
    // Deal lifecycle
    // ---------------------------------------------------------------------

    /// @notice Create a deal. Called by the seller side (owner, or the brokering
    ///         agent). For agent-brokered deals a valid accepted mandate is
    ///         required, and its commission rate is snapshotted into the deal.
    /// @param agent address(0) => owner-direct (no commission). Otherwise the
    ///         brokering agent, who must hold a valid mandate from `seller`.
    function createDeal(
        address buyer,
        address seller,
        address agent,
        uint256 price,
        bytes32 listingRef,
        uint16 commissionBps
    ) external returns (uint256 id) {
        require(buyer != address(0) && seller != address(0), "bad party");
        require(buyer != seller, "buyer is seller");
        require(price > 0, "bad price");
        require(msg.sender == seller || msg.sender == agent || msg.sender == owner(), "not seller side");

        if (agent == address(0)) {
            require(commissionBps == 0, "no agent");
        }

        require(uint256(commissionBps) + platformFeeBps <= 10_000, "splits exceed 100%");

        id = nextDealId++;
        _deals[id] = Deal({
            buyer: buyer,
            seller: seller,
            agent: agent,
            price: price,
            commissionBps: commissionBps,
            platformFeeBps: platformFeeBps,
            mandateId: 0,
            listingRef: listingRef,
            state: DealState.Created,
            fundedAt: 0,
            disputeDeadline: 0
        });

        emit DealCreated(id, buyer, seller, agent, price, commissionBps, platformFeeBps, listingRef, 0);
    }

    /// @notice Buyer deposits the full price in USDC. Requires prior approve().
    function fundDeal(uint256 id) external nonReentrant {
        Deal storage d = _deals[id];
        require(d.state == DealState.Created, "not fundable");
        require(msg.sender == d.buyer, "not buyer");

        d.state = DealState.Funded;
        d.fundedAt = uint64(block.timestamp);
        d.disputeDeadline = uint64(block.timestamp) + disputeWindow;

        usdc.safeTransferFrom(msg.sender, address(this), d.price);
        emit DealFunded(id, msg.sender, d.price, d.disputeDeadline);
    }

    /// @notice Buyer confirms they received the property/title -> release funds.
    function confirmCompletion(uint256 id) external nonReentrant {
        Deal storage d = _deals[id];
        require(d.state == DealState.Funded, "not funded");
        require(msg.sender == d.buyer, "not buyer");
        _settle(id, d);
    }

    /// @notice If the buyer neither confirms nor disputes within the window, the
    ///         seller side may claim. Protects sellers from a silent buyer who
    ///         already took possession.
    function claimAfterTimeout(uint256 id) external nonReentrant {
        Deal storage d = _deals[id];
        require(d.state == DealState.Funded, "not funded");
        require(msg.sender == d.seller || msg.sender == d.agent, "not seller side");
        require(block.timestamp >= d.disputeDeadline, "window open");
        _settle(id, d);
    }

    /// @notice Any party may raise a dispute while the window is open.
    function raiseDispute(uint256 id) external {
        Deal storage d = _deals[id];
        require(d.state == DealState.Funded, "not funded");
        require(msg.sender == d.buyer || msg.sender == d.seller || msg.sender == d.agent, "not party");
        require(block.timestamp < d.disputeDeadline, "window closed");
        d.state = DealState.Disputed;
        emit DealDisputed(id, msg.sender);
    }

    /// @notice Arbiter resolves a dispute: either release to the seller side
    ///         (and split commission) or refund the buyer in full.
    function resolveDispute(uint256 id, bool releaseToSeller) external nonReentrant {
        require(msg.sender == arbiter, "not arbiter");
        Deal storage d = _deals[id];
        require(d.state == DealState.Disputed, "not disputed");

        if (releaseToSeller) {
            _settle(id, d);
        } else {
            d.state = DealState.Cancelled;
            usdc.safeTransfer(d.buyer, d.price);
            emit DealRefunded(id, d.buyer, d.price);
        }
    }

    /// @notice Cancel an unfunded deal. Any party may cancel before funding.
    function cancelDeal(uint256 id) external {
        Deal storage d = _deals[id];
        require(d.state == DealState.Created, "not cancellable");
        require(msg.sender == d.buyer || msg.sender == d.seller || msg.sender == d.agent, "not party");
        d.state = DealState.Cancelled;
        emit DealCancelled(id);
    }

    function _settle(uint256 id, Deal storage d) private {
        d.state = DealState.Completed;

        uint256 commission = (d.price * d.commissionBps) / 10_000;
        uint256 fee = (d.price * d.platformFeeBps) / 10_000;
        uint256 proceeds = d.price - commission - fee;

        // Pay the agent and seller now; retain the platform fee in the contract
        // so only the deployer can withdraw it later.
        if (commission > 0) usdc.safeTransfer(d.agent, commission);
        if (fee > 0) accruedFees += fee;
        usdc.safeTransfer(d.seller, proceeds);

        emit DealCompleted(id, proceeds, commission, fee);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getDeal(uint256 id) external view returns (Deal memory) {
        return _deals[id];
    }

    /// @notice Preview how a price would split, given a commission rate and the
    ///         current platform fee. Pure helper for UIs.
    function quote(uint256 price, uint16 commissionBps)
        external
        view
        returns (uint256 commission, uint256 fee, uint256 proceeds)
    {
        commission = (price * commissionBps) / 10_000;
        fee = (price * platformFeeBps) / 10_000;
        proceeds = price - commission - fee;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Withdraw all accumulated platform fees to `feeRecipient`.
    ///         Only the contract owner (deployer) can call this.
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accruedFees;
        require(amount > 0, "no fees");
        accruedFees = 0;
        usdc.safeTransfer(feeRecipient, amount);
        emit FeesWithdrawn(feeRecipient, amount);
    }

    function setPlatformFee(uint16 bps) external onlyOwner {
        require(bps <= MAX_PLATFORM_FEE_BPS, "fee too high");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "zero address");
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    function setArbiter(address arbiter_) external onlyOwner {
        require(arbiter_ != address(0), "zero address");
        arbiter = arbiter_;
        emit ArbiterUpdated(arbiter_);
    }

    function setDisputeWindow(uint64 window) external onlyOwner {
        require(window >= 1 days && window <= 60 days, "out of range");
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }
}
