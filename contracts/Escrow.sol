// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "./ReputationToken.sol";

contract Escrow {

    /* =================
     * ENUMS & STRUCTS
     * ================= */

    enum Role { None, Shipper, Carrier }

    enum AgreementStatus {
        Created,     // agreement exists, not funded
        Accepted,    // carrier accepted, ready to be funded
        Rejected,    // carrier declined, no funds ever moved
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
        AgreementDetails details;
    }

    struct AgreementDetails {
        uint8 origin;
        uint8 destination;
        uint8 itemType;
        uint8 size;
        uint256 weight;
        uint8 deliverySpeed;
        uint8 guaranteeTier;
        string photoCID;
    }

    struct Evidence {
        address submittedBy;
        string description;
        string fileCID;
        uint256 timestamp;
    }

    struct CarrierProfile {
        uint8 location;
        uint8 deliveryTypes;
        bool isSet;
    }

    /* =================
     * STATE VARIABLES
     * =================*/

    mapping(uint256 => Agreement) public agreements;
    mapping(address => Role) public userRole;
    mapping(address => string) public displayName;
    mapping(address => uint256[]) public userAgreements;
    mapping(address => CarrierProfile) public carrierProfiles;
    mapping(address => uint256) public completionReputationEarned;
    mapping(address => uint256) public disputeReputationEarned;

    address[] public carrierList;   
    address public arbitrator;

    bool private locked;

    ReputationToken public reputationToken;

    uint256 public agreementCount;
    uint256 public constant COMMISSION_PERCENT = 5;
    uint256 public arbitratorEarnings;
    uint256 public completionReward = 100;
    uint256 public disputeWinReward = 100;
    uint256 public constant MAX_REPUTATION_REWARD = 500;

    /* =========
     * EVENTS
     * ========= */

    event UserRegistered(address indexed user, Role role);
    event DisplayNameUpdated(address indexed user, string displayName);
    event AgreementCreated(uint256 indexed agreementId, address indexed shipper, address indexed carrier, uint256 totalValue, uint256 deadline, string photoCID);
    event AgreementAccepted(uint256 indexed agreementId);
    event AgreementRejected(uint256 indexed agreementId);
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event DeadlineExtended(uint256 indexed agreementId, uint256 newDeadline);
    event MilestoneReported(uint256 indexed agreementId, uint256 milestoneIndex, uint256 timestamp);
    event MilestoneVerified(uint256 indexed agreementId, uint256 milestoneIndex, uint256 payoutAmount);
    event AgreementRefunded(uint256 indexed agreementId, uint256 amount);
    event DisputeRaised(uint256 indexed agreementId, address indexed raisedBy);
    event DisputeResolved(uint256 indexed agreementId, string resolution);
    event EvidenceSubmitted(uint256 indexed agreementId, address indexed submittedBy, string fileCID);
    event CommissionCollected(uint256 indexed agreementId, uint256 amount);
    event CommissionWithdrawn(uint256 amount);
    event ReputationRewardsUpdated(uint256 completionReward, uint256 disputeWinReward);
    event CarrierProfileUpdated(address indexed carrier, uint8 location, uint8 deliveryTypes);

    /* ===========
     * MODIFIERS
     * ===========*/

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

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Only arbitrator can resolve disputes");
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

    /* ===================================
     * REGISTRATION & AGREEMENT CREATION 
     * ===================================*/

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

    function setCarrierProfile(uint8 location, uint8 deliveryTypes) public {
        require(userRole[msg.sender] == Role.Carrier, "Only a registered Carrier can set a profile");
        require(location >= 1 && location <= 15, "Invalid location");
        require(deliveryTypes >= 1 && deliveryTypes <= 7, "Invalid delivery type bitmask");

        carrierProfiles[msg.sender] = CarrierProfile({
            location: location,
            deliveryTypes: deliveryTypes,
            isSet: true
        });

        emit CarrierProfileUpdated(msg.sender, location, deliveryTypes);
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
        uint256[] memory milestonePercentages,
        AgreementDetails memory details
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

        require(details.origin >= 1 && details.origin <= 15, "Invalid origin");
        require(details.destination >= 1 && details.destination <= 15, "Invalid destination");
        require(details.origin != details.destination, "Origin and destination must differ");
        require(details.itemType >= 1 && details.itemType <= 6, "Invalid item type");
        require(details.size >= 1 && details.size <= 4, "Invalid size");
        require(details.weight > 0, "Weight must be greater than zero");
        require(details.deliverySpeed >= 1 && details.deliverySpeed <= 4, "Invalid delivery speed");
        require(details.guaranteeTier >= 1 && details.guaranteeTier <= 3, "Invalid guarantee tier");

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
        a.details = details;

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

        userAgreements[msg.sender].push(newId);
        userAgreements[carrier].push(newId);

        agreementCount++;

        emit AgreementCreated(newId, msg.sender, carrier, totalValue, deadline, details.photoCID);
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

    function getAgreementDetails(uint256 agreementId) public view returns (
        uint8 origin,
        uint8 destination,
        uint8 itemType,
        uint8 size,
        uint256 weight,
        uint8 deliverySpeed,
        uint8 guaranteeTier,
        string memory photoCID
    ) {
        require(agreementId < agreementCount, "Agreement does not exist");
        AgreementDetails storage d = agreements[agreementId].details;
        return (
            d.origin,
            d.destination,
            d.itemType,
            d.size,
            d.weight,
            d.deliverySpeed,
            d.guaranteeTier,
            d.photoCID
        );
    }

    function getCarrierProfile(address carrier) public view returns (
        uint8 location,
        uint8 deliveryTypes,
        bool isSet
    ) {
        CarrierProfile storage p = carrierProfiles[carrier];
        return (p.location, p.deliveryTypes, p.isSet);
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

    /* ==================
     * FUNDING & PAYOUT 
     * ================== */

    function acceptAgreement(uint256 agreementId)
        public
        onlyCarrierOf(agreementId)
        inStatus(agreementId, AgreementStatus.Created)
    {
        agreements[agreementId].status = AgreementStatus.Accepted;
        emit AgreementAccepted(agreementId);
    }

    function rejectAgreement(uint256 agreementId)
        public
        onlyCarrierOf(agreementId)
        inStatus(agreementId, AgreementStatus.Created)
    {
        agreements[agreementId].status = AgreementStatus.Rejected;
        emit AgreementRejected(agreementId);
    }

    function fundAgreement(uint256 agreementId)
        public
        payable
        onlyShipperOf(agreementId)
        inStatus(agreementId, AgreementStatus.Accepted)
    {
        Agreement storage agreement = agreements[agreementId];

        require(msg.value == agreement.totalValue, "Must fund exact total value in one transaction");

        agreement.fundedAmount = msg.value;
        agreement.status = AgreementStatus.Funded;

        emit AgreementFunded(agreementId, msg.value);
    }

    function extendDeadline(uint256 agreementId, uint256 newDeadline)
        public
        onlyShipperOf(agreementId)
    {
        Agreement storage agreement = agreements[agreementId];

        require(
            agreement.status != AgreementStatus.Completed &&
            agreement.status != AgreementStatus.Refunded &&
            agreement.status != AgreementStatus.Disputed &&
            agreement.status != AgreementStatus.Rejected,
            "Agreement is closed"
        );
        require(newDeadline > agreement.deadline, "New deadline must be later");
        require(newDeadline > block.timestamp, "New deadline must be in the future");

        agreement.deadline = newDeadline;

        emit DeadlineExtended(agreementId, newDeadline);
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

        uint256 payout = (agreement.totalValue * milestone.payoutPercentage) / 100;

        require(
            payout > 0,"Payout must be greater than zero"
        );

        require(
            agreement.releasedAmount + payout <= agreement.fundedAmount,
            "Payout exceeds escrow balance"
        );

        uint256 commission = (payout * COMMISSION_PERCENT) / 100;
        uint256 carrierAmount = payout - commission;

        milestone.completed = true;
        milestone.completedTimestamp = block.timestamp;

        agreement.releasedAmount += payout;
        arbitratorEarnings += commission;

        (bool sent, ) =
            payable(agreement.carrier).call{
                value: carrierAmount
            }("");

        require(
            sent, "Payment to carrier failed"
        );

        emit CommissionCollected(agreementId, commission);

        bool allCompleted = true;

        for (uint256 i = 0; i < agreement.milestones.length; i++) {
            if (!agreement.milestones[i].completed) {
                allCompleted = false;
                break;
            }
        }

        if (allCompleted) {
            agreement.status = AgreementStatus.Completed;

            completionReputationEarned[agreement.carrier] += completionReward;

            reputationToken.mint(
                agreement.carrier,
                completionReward
            );
        } else {
            agreement.status = AgreementStatus.InProgress;
        }

        emit MilestoneVerified(agreementId, milestoneIndex, payout
        );
    }

    function withdrawCommission() public onlyArbitrator nonReentrant {
        uint256 amount = arbitratorEarnings;
        require(amount > 0, "No commission to withdraw");

        arbitratorEarnings = 0;

        (bool sent, ) = payable(arbitrator).call{value: amount}("");
        require(sent, "Commission withdrawal failed");

        emit CommissionWithdrawn(amount);
    }

    /* ===============================
     * DEADLINES, REFUNDS & DISPUTES 
     * ===============================*/

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
        agreement.releasedAmount += remaining;

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
                agreement.releasedAmount += remaining;
                (bool sent, ) = payable(agreement.shipper).call{value: remaining}("");
                require(sent, "Refund to shipper failed");
            }
            emit DisputeResolved(agreementId, "Dispute resolved: Remaining funds refunded to shipper");
        } else {
            agreement.status = AgreementStatus.Completed;
            if (remaining > 0) {
                // Same commission cut as a normal milestone payout.
                uint256 commission = (remaining * COMMISSION_PERCENT) / 100;
                uint256 carrierAmount = remaining - commission;

                agreement.releasedAmount += remaining;
                arbitratorEarnings += commission;

                (bool sent, ) = payable(agreement.carrier).call{value: carrierAmount}("");
                require(sent, "Payout to carrier failed");

                emit CommissionCollected(agreementId, commission);
            }

            disputeReputationEarned[agreement.carrier] += disputeWinReward;
            reputationToken.mint(agreement.carrier, disputeWinReward);

            emit DisputeResolved(agreementId, "Dispute resolved: Remaining funds paid to carrier");
        }
    }

    function setCompletionReward(uint256 newReward) public onlyArbitrator {
        require(newReward > 0, "Completion reward must be greater than zero");
        require(newReward <= MAX_REPUTATION_REWARD, "Reward exceeds maximum");
        completionReward = newReward;
        emit ReputationRewardsUpdated(completionReward, disputeWinReward);
    }

    function setDisputeWinReward(uint256 newReward) public onlyArbitrator {
        require(newReward > 0, "Dispute reward must be greater than zero");
        require(newReward <= MAX_REPUTATION_REWARD, "Reward exceeds maximum");
        disputeWinReward = newReward;
        emit ReputationRewardsUpdated(completionReward, disputeWinReward);
    }

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

    function getEvidenceCount(uint256 agreementId) public view returns (uint256) {
        require(agreementId < agreementCount, "Agreement does not exist");
        return agreements[agreementId].evidence.length;
    }

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

    function getDisputeReason(uint256 agreementId) public view returns (
        uint8 reason,
        string memory otherReason
    ) {
        require(agreementId < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[agreementId];
        return (a.disputeReason, a.disputeOtherReason);
    }
}