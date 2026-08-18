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
    // =================================================================

    /// @notice Register the caller as a Shipper or Carrier.
    function registerUser(Role role) public {
        require(role == Role.Shipper || role == Role.Carrier, "Invalid role");
        require(userRole[msg.sender] == Role.None, "Already registered");

        userRole[msg.sender] = role;

        if (role == Role.Carrier) {
            carrierList.push(msg.sender);
        }

        emit UserRegistered(msg.sender, role);
    }

    /// @notice Returns every address currently registered as a Carrier.
    function getAllCarriers() public view returns (address[] memory) {
        return carrierList;
    }

    /// @notice Shipper creates a new logistics agreement with a carrier.
    function createAgreement(
        address carrier,
        uint256 totalValue,
        uint256 deadline,
        string[] memory milestoneDescriptions,
        uint256[] memory milestonePercentages
    ) public onlyRegistered {
        require(userRole[msg.sender] == Role.Shipper, "Only a Shipper can create an agreement");
        require(userRole[carrier] == Role.Carrier, "Selected address is not a registered Carrier");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(totalValue > 0, "Total value must be greater than zero");
        require(
            milestoneDescriptions.length == milestonePercentages.length,
            "Milestone array length mismatch"
        );
        require(milestoneDescriptions.length > 0, "At least one milestone required");

        uint256 sum = 0;
        for (uint256 i = 0; i < milestonePercentages.length; i++) {
            sum += milestonePercentages[i];
        }
        require(sum == 100, "Milestone payout percentages must sum to 100");

        uint256 newId = agreementCount;
        Agreement storage a = agreements[newId];
        a.id = newId;
        a.shipper = msg.sender;
        a.carrier = carrier;
        a.totalValue = totalValue;
        a.deadline = deadline;
        a.status = AgreementStatus.Created;
        // fundedAmount and releasedAmount default to 0 automatically

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            a.milestones.push(Milestone({
                description: milestoneDescriptions[i],
                payoutPercentage: milestonePercentages[i],
                reported: false,
                completed: false,
                reportedTimestamp: 0,
                completedTimestamp: 0
            }));
        }

        agreementCount++;

        emit AgreementCreated(newId, msg.sender, carrier, totalValue, deadline);
    }

    /// @notice Carrier reports that a milestone has been physically
    /// completed. This does NOT release any funds yet.
    function reportMilestone(uint256 agreementId, uint256 milestoneIndex)
        public
        onlyCarrierOf(agreementId)
        beforeDeadline(agreementId)
    {
        Agreement storage a = agreements[agreementId];

        require(
            a.status == AgreementStatus.Funded || a.status == AgreementStatus.InProgress,
            "Agreement is not funded/active"
        );
        require(milestoneIndex < a.milestones.length, "Invalid milestone index");

        Milestone storage m = a.milestones[milestoneIndex];
        require(!m.reported, "Milestone already reported");
        require(!m.completed, "Milestone already completed");

        m.reported = true;
        m.reportedTimestamp = block.timestamp;

        emit MilestoneReported(agreementId, milestoneIndex, block.timestamp);
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
        require(agreementId < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[agreementId];
        return (a.shipper, a.carrier, a.totalValue, a.fundedAmount, a.releasedAmount, a.deadline, a.status);
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
        require(agreementId < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[agreementId];
        require(milestoneIndex < a.milestones.length, "Invalid milestone index");
        Milestone storage m = a.milestones[milestoneIndex];
        return (m.description, m.payoutPercentage, m.reported, m.completed, m.reportedTimestamp, m.completedTimestamp);
    }

    function getMilestoneCount(uint256 agreementId) public view returns (uint256) {
        require(agreementId < agreementCount, "Agreement does not exist");
        return agreements[agreementId].milestones.length;
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
