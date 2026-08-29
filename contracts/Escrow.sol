// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ReputationToken.sol";

contract Escrow {

    enum Role { None, Shipper, Carrier }

    enum AgreementStatus {
        Created,     // agreement exists, not funded
        Funded,      // funds locked in escrow
        InProgress,  // at least one milestone verified
        Completed,   // all milestones verified
        Refunded,    // deadline missed, funds returned
        Disputed     // await resolution
    }

    struct Milestone {
        uint8 milestoneType;
        string otherDescription;
        uint256 payoutPercentage;   
        bool reported;              
        bool completed;            
        uint256 reportedTimestamp;
        uint256 completedTimestamp;
        string proofCID;  // IPFS CID of photo/document proof (optional, empty allowed)
    }

    struct Agreement {
        uint256 id;
        address shipper;
        address carrier;
        uint256 totalValue;        
        uint256 fundedAmount;     
        uint256 releasedAmount;     
        uint256 deadline;         
        AgreementStatus status;

        Milestone[] milestones;

        uint8 disputeReason;
        string disputeOtherReason;
        
        Evidence[] evidence;
    }

    struct Evidence {
        address submittedBy;
        string description;
        string fileCID;
        uint256 timestamp;
    }

    mapping(uint256 => Agreement) public agreements;
    mapping(address => Role) public userRole;

    // Optional, human-friendly label a user can set for themselves (a name,
    // company name, or handle -- doesn't have to be their real identity).
    // Anyone can read anyone else's, so a Shipper can recognise a Carrier
    // and vice versa, instead of only ever seeing raw wallet addresses.
    mapping(address => string) public displayName;

    mapping(address => uint256[]) public userAgreements;

    address[] public carrierList;   
    uint256 public agreementCount;
    bool private locked;

    ReputationToken public reputationToken;
    address public arbitrator;

    event UserRegistered(address indexed user, Role role);
    event DisplayNameUpdated(address indexed user, string displayName);
    event AgreementCreated(uint256 indexed agreementId, address indexed shipper, address indexed carrier, uint256 totalValue, uint256 deadline);
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event MilestoneReported(uint256 indexed agreementId, uint256 milestoneIndex, uint256 timestamp);
    event MilestoneVerified(uint256 indexed agreementId, uint256 milestoneIndex, uint256 payoutAmount);
    event AgreementRefunded(uint256 indexed agreementId, uint256 amount);
    event DisputeRaised(uint256 indexed agreementId, address indexed raisedBy);
    event DisputeResolved(uint256 indexed agreementId, string resolution);
    event EvidenceSubmitted(uint256 indexed agreementId, address indexed submittedBy, string fileCID);

    modifier onlyRegistered() {
        require(userRole[msg.sender] != Role.None, "Not registered");
        _;
    }

    modifier onlyShipperOf(uint256 agreementId) {
        require(agreements[agreementId].shipper == msg.sender, "Not the agreement's shipper");
        _;
    }

    modifier onlyCarrierOf(uint256 agreementId) {
        require(agreements[agreementId].carrier == msg.sender, "Not the agreement's carrier");
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

    modifier nonReentrant() {
        require(!locked, "Reentrant call blocked");
        locked = true;
        _;
        locked = false;
    }

    constructor(address reputationTokenAddress) {
        require(
            reputationTokenAddress != address(0), "Invalid reputation token address"
        );
        reputationToken = ReputationToken(reputationTokenAddress);
        arbitrator = msg.sender; 
    }

    // =================================================================
    // Registration, Agreement Creation & Milestone Reporting
    // =================================================================

    function registerUser(Role role) public {
        require(role == Role.Shipper || role == Role.Carrier, "Invalid role");
        require(userRole[msg.sender] == Role.None, "Already registered");

        userRole[msg.sender] = role;

        if (role == Role.Carrier) {
            carrierList.push(msg.sender);
        }

        emit UserRegistered(msg.sender, role);
    }

    function setDisplayName(string memory name) public onlyRegistered {
        require(bytes(name).length <= 64, "Display name is too long");
        displayName[msg.sender] = name;
        emit DisplayNameUpdated(msg.sender, name);
    }

    function getAllCarriers() public view returns (address[] memory) {
        return carrierList;
    }

    function createAgreement(
        address carrier,
        uint256 totalValue,
        uint256 deadline,
        uint8[] memory milestoneTypes,
        string[] memory milestoneOtherDescriptions,
        uint256[] memory milestonePercentages
    ) public onlyRegistered {
        require(userRole[msg.sender] == Role.Shipper, "Only Shipper can create agreement");
        require(userRole[carrier] == Role.Carrier, "Selected address is not a registered Carrier");
        require(carrier != msg.sender, "Shipper and carrier must be different addresses");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(totalValue > 0, "Total value must be greater than zero");
        require(milestoneTypes.length > 0, "At least one milestone required");
        require(
            milestoneTypes.length == milestonePercentages.length,
            "Milestone array length mismatch"
        );
        require(milestoneTypes.length == milestoneOtherDescriptions.length, 
        "Milestone description array length mismatch");

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

        for (uint256 i = 0; i < milestoneTypes.length; i++) {
            require(
                milestoneTypes[i] >= 1 &&
                milestoneTypes[i] <= 6,
                "Invalid milestone type"
            );

            require(
                milestonePercentages[i] > 0,
                "Milestone percentage must be greater than zero"
            );
            
            if (milestoneTypes[i] == 6) {
                require(
                    bytes(milestoneOtherDescriptions[i]).length > 0,
                    "Other description required"
                );
            }

            a.milestones.push(
                Milestone({
                    milestoneType: milestoneTypes[i],
                    otherDescription: milestoneOtherDescriptions[i],
                    payoutPercentage: milestonePercentages[i],
                    reported: false,
                    completed: false,
                    reportedTimestamp: 0,
                    completedTimestamp: 0,
                    proofCID: ""
                })
            );
        }

        // added 
        userAgreements[msg.sender].push(newId);
        userAgreements[carrier].push(newId);

        agreementCount++;

        emit AgreementCreated(newId, msg.sender, carrier, totalValue, deadline);
    }

    function reportMilestone(uint256 agreementId, uint256 milestoneIndex, string memory proofCID)
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
        m.proofCID = proofCID;

        emit MilestoneReported(agreementId, milestoneIndex, block.timestamp);
    }

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

    function getUserAgreements(address user)
        public 
        view 
        returns (uint256[] memory)
    {
        return userAgreements[user];
    }


    function getMilestone(uint256 agreementId, uint256 milestoneIndex) public view returns (
        uint8 milestoneType,
        string memory otherDescription,
        uint256 payoutPercentage,
        bool reported,
        bool completed,
        uint256 reportedTimestamp,
        uint256 completedTimestamp,
        string memory proofCID
    ) {
        require(
            agreementId < agreementCount,
            "Agreement does not exist"
            );
            
        Agreement storage a = agreements[agreementId];
        
        require(
            milestoneIndex < a.milestones.length,
            "Invalid milestone index"
             );

        Milestone storage m = a.milestones[milestoneIndex];

        return (
            m.milestoneType,
            m.otherDescription,
            m.payoutPercentage,
            m.reported,
            m.completed,
            m.reportedTimestamp,
            m.completedTimestamp,
            m.proofCID
        );
    }

    function getMilestoneCount(uint256 agreementId) public view returns (uint256) {
        require(agreementId < agreementCount, "Agreement does not exist");
        return agreements[agreementId].milestones.length;
    }

    function fundAgreement(uint256 agreementId)
        public
        payable
        onlyShipperOf(agreementId)
        inStatus(agreementId, AgreementStatus.Created)
    {
        Agreement storage agreement = agreements[agreementId];

        require(msg.value == agreement.totalValue, "Must fund exact total value in one transaction");

        agreement.fundedAmount = msg.value;
        agreement.status = AgreementStatus.Funded;

        emit AgreementFunded(agreementId, msg.value);
    }

    function verifyMilestone(uint256 agreementId,uint256 milestoneIndex)
        public
        onlyShipperOf(agreementId)
        nonReentrant
    {
        Agreement storage agreement = agreements[agreementId];
        
        require(
            agreement.status == AgreementStatus.Funded || agreement.status == AgreementStatus.InProgress,
            "Agreement not in a payable state"
        );

        require(
            milestoneIndex < agreement.milestones.length, "Invalid milestone index"
        );

        Milestone storage milestone = agreement.milestones[milestoneIndex];

        require(
            milestone.reported, "Milestone has not been reported yet"
        );

        require(!milestone.completed, "Milestone already verified"
        );

        uint256 payout =
            (
                agreement.totalValue *
                milestone.payoutPercentage
            ) / 100;

        require(
            payout > 0,"Payout must be greater than zero"
        );

        require(
            agreement.releasedAmount + payout <= agreement.fundedAmount,
            "Payout exceeds escrow balance"
        );

        milestone.completed = true;
        milestone.completedTimestamp = block.timestamp;

        agreement.releasedAmount += payout;

        (bool sent, ) =
            payable(agreement.carrier).call{
                value: payout
            }("");

        require(
            sent, "Payment to carrier failed"
        );

        bool allCompleted = true;

        for (uint256 i = 0; i < agreement.milestones.length; i++) {
            if (!agreement.milestones[i].completed) {
                allCompleted = false;
                break;
            }
        }

        if (allCompleted) {
            agreement.status = AgreementStatus.Completed;

            reputationToken.mint(
                agreement.carrier,
                100
            );
        } else {
            agreement.status = AgreementStatus.InProgress;
        }

        emit MilestoneVerified(agreementId, milestoneIndex, payout
        );
    }

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Only arbitrator can resolve disputes");
        _;
    }

    function checkAndRefund(uint256 agreementId) public nonReentrant {
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

    function raiseDispute(
        uint256 agreementId,
        uint8 reason,
        string memory otherReason
    )
    public onlyParticipant(agreementId) {
        Agreement storage agreement = agreements[agreementId];
        
        require(
            block.timestamp <= agreement.deadline,
            "Deadline has passed"
        );
        
        require(
            agreement.status == AgreementStatus.Funded || agreement.status == AgreementStatus.InProgress,
            "Cannot dispute an inactive or finalized agreement"
        );

        require(reason >= 1 && reason <= 5, "Invalid dispute reason");

        if(reason == 5) {
            require(bytes(otherReason).length > 0, "Other reason required");
        } else {
            require(
                bytes(otherReason).length == 0,
                "Other reason should be empty"
            );
        }

        agreement.disputeReason = reason;
        agreement.disputeOtherReason = otherReason;
        agreement.status = AgreementStatus.Disputed;
    

        emit DisputeRaised(agreementId, msg.sender);
    }

    function resolveDispute(uint256 agreementId, bool refundShipper)
        public
        onlyArbitrator
        nonReentrant
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

            reputationToken.mint(agreement.carrier, 100);

            emit DisputeResolved(agreementId, "Dispute resolved: Remaining funds paid to carrier");
        }
    }

    /// @notice Participant submits evidence while a dispute is open, for the arbitrator to review.
    function submitEvidence(
        uint256 agreementId,
        string memory description,
        string memory fileCID
    )
        public
        onlyParticipant(agreementId)
    {
        Agreement storage agreement = agreements[agreementId];

        require(
            agreement.status == AgreementStatus.Disputed,
            "Agreement is not disputed"
        );

        require(
            bytes(description).length > 0,
            "Description required"
        );

        agreement.evidence.push(
            Evidence({
                submittedBy: msg.sender,
                description: description,
                fileCID: fileCID,
                timestamp: block.timestamp
            })
        );

        emit EvidenceSubmitted(
            agreementId,
            msg.sender,
            fileCID
        );
    }

    /// @notice How many pieces of evidence have been submitted for an agreement.
    function getEvidenceCount(uint256 agreementId) public view returns (uint256) {
        require(agreementId < agreementCount, "Agreement does not exist");
        return agreements[agreementId].evidence.length;
    }

    /// @notice Read a single piece of evidence (for the arbitrator/UI to review before resolving).
    function getEvidence(uint256 agreementId, uint256 evidenceIndex) public view returns (
        address submittedBy,
        string memory description,
        string memory fileCID,
        uint256 timestamp
    ) {
        require(agreementId < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[agreementId];
        require(evidenceIndex < a.evidence.length, "Invalid evidence index");
        Evidence storage e = a.evidence[evidenceIndex];
        return (e.submittedBy, e.description, e.fileCID, e.timestamp);
    }

    /// @notice Read the reason a dispute was raised (for the arbitrator/UI).
    function getDisputeReason(uint256 agreementId) public view returns (
        uint8 reason,
        string memory otherReason
    ) {
        require(agreementId < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[agreementId];
        return (a.disputeReason, a.disputeOtherReason);
    }
}
