// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ReputationToken.sol";

/**
 * =====================================================================
 *  ESCROW.SOL — Decentralized Escrow & Milestone-Based Logistics
 *  (Version 2 — "verify then pay" model)
 * =====================================================================
 *  DESIGN CHANGE FROM v1:
 *  A milestone now has TWO steps instead of one:
 *    1. Carrier REPORTS it as done (reportMilestone) — no money moves yet.
 *    2. Shipper VERIFIES it (verifyMilestone) — THIS is what actually
 *       triggers the payout.
 *  If the Shipper disagrees with a reported milestone, OR the Carrier
 *  feels a legitimate report is being ignored, EITHER party can raise
 *  a dispute instead.
 * =====================================================================
 */

contract Escrow {

    // =================================================================
    // SHARED — enums, structs, state variables, modifiers, events
    // =================================================================

    enum Role { None, Shipper, Carrier }

    enum AgreementStatus {
        Created,     // agreement exists, not yet funded
        Funded,      // shipper has locked funds in escrow
        InProgress,  // at least one milestone verified, not all
        Completed,   // all milestones verified, fully paid out
        Refunded,    // deadline missed, funds returned to shipper
        Disputed     // a dispute has been raised, awaiting resolution
    }

    struct Milestone {
        string description;
        uint256 payoutPercentage;   // e.g. 30 = 30% of totalValue
        bool reported;              // Carrier says "I've done this"
        bool completed;             // Shipper has verified + been paid out
        uint256 reportedTimestamp;
        uint256 completedTimestamp;
    }

    struct Agreement {
        uint256 id;
        address shipper;
        address carrier;
        uint256 totalValue;         // total Wei to be escrowed
        uint256 fundedAmount;       // Wei actually deposited so far
        uint256 releasedAmount;     // Wei already paid out to carrier
        uint256 deadline;           // unix timestamp
        AgreementStatus status;
        Milestone[] milestones;
    }

    mapping(uint256 => Agreement) public agreements;
    mapping(address => Role) public userRole;
    address[] public carrierList;   // every address that has registered as a Carrier
    uint256 public agreementCount;

    ReputationToken public reputationToken;

    // ---- Events (used by frontend to show tx history / update UI) ----
    event UserRegistered(address indexed user, Role role);
    event AgreementCreated(uint256 indexed agreementId, address indexed shipper, address indexed carrier, uint256 totalValue, uint256 deadline);
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event MilestoneReported(uint256 indexed agreementId, uint256 milestoneIndex, uint256 timestamp);
    event MilestoneVerified(uint256 indexed agreementId, uint256 milestoneIndex, uint256 payoutAmount);
    event AgreementRefunded(uint256 indexed agreementId, uint256 amount);
    event DisputeRaised(uint256 indexed agreementId, address indexed raisedBy);
    event DisputeResolved(uint256 indexed agreementId, string resolution);

    // ---- Modifiers (shared guard logic — see Lab 7.3) ----

    modifier onlyRegistered() {
        require(userRole[msg.sender] != Role.None, "Not registered");
        _;
    }

    modifier onlyShipperOf(uint256 agreementId) {
        require(agreements[agreementId].shipper == msg.sender, "Not the shipper of this agreement");
        _;
    }

    modifier onlyCarrierOf(uint256 agreementId) {
        require(agreements[agreementId].carrier == msg.sender, "Not the carrier of this agreement");
        _;
    }

    modifier onlyParticipant(uint256 agreementId) {
        require(
            agreements[agreementId].shipper == msg.sender || agreements[agreementId].carrier == msg.sender,
            "Not a participant in this agreement"
        );
        _;
    }

    modifier inStatus(uint256 agreementId, AgreementStatus requiredStatus) {
        require(agreements[agreementId].status == requiredStatus, "Agreement not in required status");
        _;
    }

    modifier beforeDeadline(uint256 agreementId) {
        require(block.timestamp <= agreements[agreementId].deadline, "Deadline has passed");
        _;
    }

    constructor(address reputationTokenAddress) {
        require(
            reputationTokenAddress != address(0),
            "Invalid reputation token address"
        );

        reputationToken = ReputationToken(
            reputationTokenAddress
        );
        arbitrator = msg.sender;   // whoever deploys the contract becomes the arbitrator
    }

    // =================================================================
    // SECTION A — Registration, Agreement Creation & Milestone Reporting
    // Owner: Person A
    // Refer to: Lab 3 (contract structure), Lab 5 (visibility, basic
    //           types), Lab 6 Ex.1/Ex.2 (struct + mapping), Lab 7.1
    //           (enum), Lab 7.2 (block.timestamp — for reportedTimestamp)
    // =================================================================

    /// @notice Register the caller as a Shipper or Carrier.
    function registerUser(Role role) public {
        // TODO(Person A): set userRole[msg.sender], require not already
        // registered (or allow re-registering only if role == None).
        // IMPORTANT: if role == Role.Carrier, also push msg.sender into
        // carrierList — this is what lets the frontend show a clickable
        // list of carriers instead of the shipper typing an address.
        // emit UserRegistered
    }

    /// @notice Returns every address currently registered as a Carrier.
    /// Frontend calls this to render a clickable list for the Shipper
    /// to choose from when creating an agreement, instead of the
    /// Shipper having to type an address manually.
    function getAllCarriers() public view returns (address[] memory) {
        // TODO(Person A): return carrierList
    }

    /// @notice Shipper creates a new logistics agreement with a carrier.
    function createAgreement(
        address carrier,
        uint256 totalValue,
        uint256 deadline,
        string[] memory milestoneDescriptions,
        uint256[] memory milestonePercentages
    ) public onlyRegistered {
        // TODO(Person A):
        // - require caller's role == Shipper, carrier's role == Carrier
        // - require milestoneDescriptions.length == milestonePercentages.length
        // - require percentages sum to 100
        // - require deadline > block.timestamp
        //   NOTE for demo purposes: your frontend can let deadline be
        //   set just minutes in the future (e.g. block.timestamp + 300)
        //   so you can demo a missed-deadline refund live in ~20 mins.
        // - push a new Agreement into `agreements`, increment agreementCount
        //   (each Milestone starts with reported = false, completed = false)
        // - emit AgreementCreated
    }

    /// @notice Carrier reports that a milestone has been physically
    /// completed. This does NOT release any funds yet — it just flags
    /// the milestone as "awaiting shipper verification."
    function reportMilestone(uint256 agreementId, uint256 milestoneIndex)
        public
        onlyCarrierOf(agreementId)
        beforeDeadline(agreementId)
    {
        // TODO(Person A):
        // - require agreement status is Funded or InProgress
        // - require milestone not already reported and not already completed
        // - set milestones[milestoneIndex].reported = true
        // - set reportedTimestamp = block.timestamp
        // - emit MilestoneReported
    }

    /// @notice Read a single agreement's core details (for frontend display)
    function getAgreement(uint256 agreementId) public view returns (
        address shipper,
        address carrier,
        uint256 totalValue,
        uint256 fundedAmount,
        uint256 releasedAmount,
        uint256 deadline,
        AgreementStatus status
    ) {
        // TODO(Person A): return the fields from agreements[agreementId]
    }

    /// @notice Read a single milestone's details (for frontend display)
    function getMilestone(uint256 agreementId, uint256 milestoneIndex) public view returns (
        string memory description,
        uint256 payoutPercentage,
        bool reported,
        bool completed,
        uint256 reportedTimestamp,
        uint256 completedTimestamp
    ) {
        // TODO(Person A): return the fields from
        // agreements[agreementId].milestones[milestoneIndex]
    }

    function getMilestoneCount(uint256 agreementId) public view returns (uint256) {
        // TODO(Person A): return agreements[agreementId].milestones.length
    }


    // =================================================================
    // Funding & Shipper Verification / Payout
    // =================================================================
   /**
     * @notice Shipper verifies a milestone reported by the carrier.
     *
     * Verification triggers the payout.
     */
    function verifyMilestone(
        uint256 agreementId,
        uint256 milestoneIndex
    )
        public
        onlyShipperOf(agreementId)
    {
        Agreement storage agreement =
            agreements[agreementId];

        require(
            agreement.status == AgreementStatus.Funded ||
            agreement.status == AgreementStatus.InProgress,
            "Agreement not in a payable state"
        );

        require(
            milestoneIndex < agreement.milestones.length,
            "Invalid milestone index"
        );

        Milestone storage milestone =
            agreement.milestones[milestoneIndex];

        require(
            milestone.reported,
            "Milestone has not been reported yet"
        );

        require(
            !milestone.completed,
            "Milestone already verified"
        );

        uint256 payout =
            (
                agreement.totalValue *
                milestone.payoutPercentage
            ) / 100;

        require(
            payout > 0,
            "Payout must be greater than zero"
        );

        require(
            agreement.releasedAmount + payout <=
            agreement.fundedAmount,
            "Payout exceeds escrow balance"
        );

        /*
         * Update the state before making the external payment.
         */
        milestone.completed = true;
        milestone.completedTimestamp = block.timestamp;

        agreement.releasedAmount += payout;

        /*
         * Pay the carrier.
         */
        (bool sent, ) =
            payable(agreement.carrier).call{
                value: payout
            }("");

        require(
            sent,
            "Payment to carrier failed"
        );

        /*
         * Check whether all milestones have been completed.
         */
        bool allCompleted = true;

        for (
            uint256 i = 0;
            i < agreement.milestones.length;
            i++
        ) {
            if (!agreement.milestones[i].completed) {
                allCompleted = false;
                break;
            }
        }

        if (allCompleted) {
            agreement.status =
                AgreementStatus.Completed;

            /*
             * Mint reputation only after all milestones
             * have been successfully verified.
             */
            reputationToken.mint(
                agreement.carrier,
                agreement.totalValue
            );
        } else {
            agreement.status =
                AgreementStatus.InProgress;
        }

        emit MilestoneVerified(
            agreementId,
            milestoneIndex,
            payout
        );
    }


    // =================================================================
    // Deadlines, Disputes, Refunds & Reputation Token
    // =================================================================

address public arbitrator;

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Only arbitrator can resolve disputes");
        _;
    }

    /// @notice Anyone can call this after the deadline to trigger a
    /// refund of remaining escrowed funds back to the shipper if not
    /// all milestones were verified in time.
    function checkAndRefund(uint256 agreementId) public {
        Agreement storage agreement = agreements[agreementId];

        require(block.timestamp > agreement.deadline, "Deadline has not passed yet");
        require(
            agreement.status == AgreementStatus.Funded || agreement.status == AgreementStatus.InProgress,
            "Agreement is not in refundable status"
        );

        uint256 remaining = agreement.fundedAmount - agreement.releasedAmount;
        require(remaining > 0, "No remaining funds to refund");

        agreement.status = AgreementStatus.Refunded;

        (bool sent, ) = payable(agreement.shipper).call{value: remaining}("");
        require(sent, "Refund transfer to shipper failed");

        emit AgreementRefunded(agreementId, remaining);
    }

    /// @notice EITHER the shipper or the carrier can raise a dispute.
    function raiseDispute(uint256 agreementId) public onlyParticipant(agreementId) {
        Agreement storage agreement = agreements[agreementId];

        require(
            agreement.status == AgreementStatus.Funded || agreement.status == AgreementStatus.InProgress,
            "Cannot dispute an inactive or finalized agreement"
        );

        agreement.status = AgreementStatus.Disputed;

        emit DisputeRaised(agreementId, msg.sender);
    }

    /// @notice Resolution mechanism — designated arbitrator decides
    /// whether to refund shipper or release remaining funds to carrier.
    function resolveDispute(uint256 agreementId, bool refundShipper)
        public
        onlyArbitrator
    {
        Agreement storage agreement = agreements[agreementId];

        require(agreement.status == AgreementStatus.Disputed, "Agreement is not in Disputed status");

        uint256 remaining = agreement.fundedAmount - agreement.releasedAmount;

        if (refundShipper) {
            agreement.status = AgreementStatus.Refunded;
            if (remaining > 0) {
                (bool sent, ) = payable(agreement.shipper).call{value: remaining}("");
                require(sent, "Refund to shipper failed");
            }
            emit DisputeResolved(agreementId, "Dispute resolved: Remaining funds refunded to shipper");
        } else {
            agreement.status = AgreementStatus.Completed;
            if (remaining > 0) {
                agreement.releasedAmount += remaining;
                (bool sent, ) = payable(agreement.carrier).call{value: remaining}("");
                require(sent, "Payout to carrier failed");
            }

            reputationToken.mint(agreement.carrier, agreement.totalValue);

            emit DisputeResolved(agreementId, "Dispute resolved: Remaining funds paid to carrier");
        }
    }
}
