const Escrow = artifacts.require('Escrow');
const ReputationToken = artifacts.require('ReputationToken');
 
// Milestone type
const MILESTONE_PICKUP = 1;
const MILESTONE_OTHER = 6;
 
// Agreement details
const agreementDetails = {
  origin: 1,
  destination: 2,
  itemType: 1,
  size: 2,
  weight: 10,
  deliverySpeed: 1,
  guaranteeTier: 1,
  photoCID: ''
};
// Dispute reason codes
const DISPUTE_OTHER = 5;
 
// AgreementStatus enum (Accepted/Rejected appended at the end, so
// Created..Disputed keep their original 0-5 values)
const STATUS_CREATED = '0';
const STATUS_FUNDED = '1';
const STATUS_INPROGRESS = '2';
const STATUS_COMPLETED = '3';
const STATUS_REFUNDED = '4';
const STATUS_DISPUTED = '5';
const STATUS_ACCEPTED = '6';
const STATUS_REJECTED = '7';
 
// 5% arbitrator commission, matching COMMISSION_PERCENT in the contract
function withCommission(amountBN) {
  const commission = amountBN.mul(new web3.utils.BN(5)).div(new web3.utils.BN(100));
  return { commission, carrierAmount: amountBN.sub(commission) };
}
 
// Helper: fast-forward the local test chain past a deadline
async function increaseTime(seconds) {
  await new Promise((resolve, reject) => {
    web3.currentProvider.send(
      { jsonrpc: '2.0', method: 'evm_increaseTime', params: [seconds], id: new Date().getTime() },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
  await new Promise((resolve, reject) => {
    web3.currentProvider.send(
      { jsonrpc: '2.0', method: 'evm_mine', params: [], id: new Date().getTime() },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
}
 
// Helper: assert a call reverts (no truffle-assertions dependency needed)
async function expectRevert(promise, message) {
  try {
    await promise;
    assert.fail('Expected revert but call succeeded');
  } catch (err) {
    assert(
      err.message.includes('revert') || err.message.includes(message || ''),
      `Expected a revert, got: ${err.message}`
    );
  }
}
 
contract('Escrow + ReputationToken', (accounts) => {
  const [deployer, shipper, carrier, stranger] = accounts;
  let escrow, token;
 
  beforeEach(async () => {
    token = await ReputationToken.new({ from: deployer });
    escrow = await Escrow.new(token.address, { from: deployer });
    await token.setMinter(escrow.address, { from: deployer });
  });
 
  // Registration
  describe('registerUser', () => {
    it('registers a shipper and a carrier', async () => {
      await escrow.registerUser(1, { from: shipper }); // 1 = Role.Shipper
      await escrow.registerUser(2, { from: carrier }); // 2 = Role.Carrier
 
      assert.equal((await escrow.userRole(shipper)).toString(), '1');
      assert.equal((await escrow.userRole(carrier)).toString(), '2');
 
      const carriers = await escrow.getAllCarriers();
      assert.include(carriers, carrier);
    });
 
    it('rejects double registration', async () => {
        await escrow.registerUser(1, { from: shipper });
      await expectRevert(escrow.registerUser(1, { from: shipper }), 'Already registered');
    });
  });
 
 
  // Display name (optional, shared, readable by both roles)
  describe('setDisplayName', () => {
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
    });
 
    it('lets a registered user set a display name, readable by anyone', async () => {
      await escrow.setDisplayName('Acme Shipping Co', { from: shipper });
      await escrow.setDisplayName('FastTrack Logistics', { from: carrier });
 
      // shipper can see the carrier's name, and vice versa -- same shared lookup
      assert.equal(await escrow.displayName(carrier), 'FastTrack Logistics');
      assert.equal(await escrow.displayName(shipper), 'Acme Shipping Co');
    });
 
    it('defaults to an empty name if never set', async () => {
      assert.equal(await escrow.displayName(carrier), '');
    });
 
    it('lets a user update their display name later', async () => {
      await escrow.setDisplayName('Old Name', { from: carrier });
      await escrow.setDisplayName('New Name', { from: carrier });
      assert.equal(await escrow.displayName(carrier), 'New Name');
    });
 
    it('rejects an unregistered address setting a display name', async () => {
      await expectRevert(escrow.setDisplayName('Nope', { from: stranger }), 'Not registered');
    });
 
    it('rejects a display name over 64 characters', async () => {
      const tooLong = 'x'.repeat(65);
      await expectRevert(escrow.setDisplayName(tooLong, { from: shipper }), 'too long');
    });
  });
 
  // Agreement creation validation
  describe('createAgreement', () => {
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
    });
 
    it('creates a valid agreement with predefined + "other" milestone types', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        web3.utils.toWei('1', 'ether'),
        deadline,
        [MILESTONE_PICKUP, MILESTONE_OTHER],
        ['', 'Customs clearance'],
        [40, 60],
        agreementDetails,
        { from: shipper }
      );
      assert.equal((await escrow.agreementCount()).toString(), '1');
 
      // Check shipper's agreements
      const shipperIds = await escrow.getUserAgreements(shipper);
 
      assert.equal(shipperIds.length, 1);
      assert.equal(shipperIds[0].toString(), '0');
 
      // Check carrier's agreements
      const carrierIds = await escrow.getUserAgreements(carrier);
 
      assert.equal(carrierIds.length, 1);
      assert.equal(carrierIds[0].toString(), '0');  
    });
 
    it('tracks multiple agreements for both shipper and carrier', async () => {
      const deadline1 =
        (await web3.eth.getBlock('latest')).timestamp + 3600;
 
      const deadline2 =
        deadline1 + 3600;
 
    // First agreement
      await escrow.createAgreement(
        carrier,
        web3.utils.toWei('1', 'ether'),
        deadline1,
        [MILESTONE_PICKUP],
        [''],
        [100],
        agreementDetails,
        { from: shipper }
      );
 
     // Second agreement
    await escrow.createAgreement(
      carrier,
      web3.utils.toWei('2', 'ether'),
      deadline2,
      [MILESTONE_PICKUP],
      [''],
      [100],
      agreementDetails,
      { from: shipper }
    );
 
    // Global agreement count
    assert.equal(
      (await escrow.agreementCount()).toString(),
      '2'
    );
 
    // Shipper should see both agreements
    const shipperIds = await escrow.getUserAgreements(shipper);
 
    assert.equal(shipperIds.length, 2);
    assert.equal(shipperIds[0].toString(), '0');
    assert.equal(shipperIds[1].toString(), '1');
 
    // Carrier should also see both agreements
    const carrierIds = await escrow.getUserAgreements(carrier);
 
    assert.equal(carrierIds.length, 2);
    assert.equal(carrierIds[0].toString(), '0');
    assert.equal(carrierIds[1].toString(), '1');
    });
 
    it('rejects milestone type "Other" (6) with an empty description', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          carrier,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [MILESTONE_OTHER],
          [''],
          [100],
          agreementDetails,
          { from: shipper }
        ),
        'Other description required'
      );
    });
 
    it('rejects an out-of-range milestone type', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          carrier,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [7], // invalid: must be 1-6
          [''],
          [100],
          agreementDetails,
          { from: shipper }
        ),
        'Invalid milestone type'
      );
    });
 
    it('rejects percentages that do not sum to 100', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          carrier,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [MILESTONE_PICKUP, MILESTONE_PICKUP],
          ['', ''],
          [40, 50],
          agreementDetails,
          { from: shipper }
        ),
        'must sum to 100'
      );
    });
 
    it('rejects shipper naming themselves as carrier', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          shipper,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [MILESTONE_PICKUP],
          [''],
          [100],
          agreementDetails,
          { from: shipper }
        ),
        'must be different addresses'
      );
    });
 
    it('rejects an unregistered carrier address', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          stranger,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [MILESTONE_PICKUP],
          [''],
          [100],
          agreementDetails,
          { from: shipper }
        ),
        'not a registered Carrier'
      );
    });
  });
 
  // Funding
  describe('fundAgreement', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier, total, deadline,
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [50, 50], agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
      await escrow.acceptAgreement(agreementId, { from: carrier });
    });
 
    it('funds the agreement with the exact total value once accepted', async () => {
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.fundedAmount.toString(), total);
      assert.equal(a.status.toString(), STATUS_FUNDED);
    });
 
    it('rejects funding with the wrong amount', async () => {
      await expectRevert(
        escrow.fundAgreement(agreementId, { from: shipper, value: web3.utils.toWei('0.5', 'ether') }),
        'exact total value'
      );
    });
 
    it('rejects funding from a non-shipper', async () => {
      await expectRevert(
        escrow.fundAgreement(agreementId, { from: carrier, value: total }),
        "Not agreement's shipper"
      );
    });
 
    it('rejects funding an agreement the carrier has not accepted yet', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      const unacceptedId = 1; // status is still Created, never accepted
      await expectRevert(
        escrow.fundAgreement(unacceptedId, { from: shipper, value: total }),
        'not in required status'
      );
    });
  });
 
  // Milestone report -> verify -> payout (happy path + completion)
  describe('reportMilestone / verifyMilestone', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier, total, deadline,
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [40, 60], agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });
 
    it('pays the carrier proportionally (minus commission) on each verified milestone and mints flat reputation on completion', async () => {
      const carrierBalBefore = new web3.utils.BN(await web3.eth.getBalance(carrier));
 
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
 
      let a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_INPROGRESS);
      // releasedAmount tracks the gross payout; commission is only taken out of what carrier receives
      assert.equal(a.releasedAmount.toString(), web3.utils.toWei('0.4', 'ether'));
 
      await escrow.reportMilestone(agreementId, 1, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 1, { from: shipper });
 
      a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_COMPLETED);
 
      const carrierBalAfter = new web3.utils.BN(await web3.eth.getBalance(carrier));
      assert(carrierBalAfter.gt(carrierBalBefore), 'carrier should have received ETH');
 
      // Reputation mint is a flat 100 points per completed agreement, not proportional to value
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '100');
      assert.equal((await token.balanceOf(shipper)).toString(), '0');
      assert.equal((await escrow.completionReputationEarned(carrier)).toString(), '100');
      assert.equal((await escrow.disputeReputationEarned(carrier)).toString(), '0');
    });
 
    it('rejects verifying a milestone that has not been reported', async () => {
      await expectRevert(
        escrow.verifyMilestone(agreementId, 0, { from: shipper }),
        'not been reported'
      );
    });
 
    it('rejects a non-carrier reporting a milestone', async () => {
      await expectRevert(
        escrow.reportMilestone(agreementId, 0, '', { from: stranger }),
        "agreement's carrier"
      );
    });
 
    it('rejects double-verifying the same milestone', async () => {
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
      await expectRevert(
        escrow.verifyMilestone(agreementId, 0, { from: shipper }),
        'already verified'
      );
    });
 
    it('stores and returns a photo-proof CID attached to a milestone report', async () => {
      await escrow.reportMilestone(agreementId, 0, 'QmPhotoProofHash123', { from: carrier });
      const m = await escrow.getMilestone(agreementId, 0);
      assert.equal(m.proofCID, 'QmPhotoProofHash123');
    });
 
    it('allows reporting with no proof (empty CID is valid)', async () => {
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      const m = await escrow.getMilestone(agreementId, 0);
      assert.equal(m.proofCID, '');
    });
 
    it('awards another 100 reputation points for each completed agreement', async () => {
      const deadline =
        (await web3.eth.getBlock('latest')).timestamp + 3600;
 
      const total = web3.utils.toWei('1', 'ether');
 
      // Create second agreement
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
 
      const secondAgreementId = 1;
 
      await escrow.acceptAgreement(secondAgreementId, { from: carrier });
 
      await escrow.fundAgreement(
        secondAgreementId,
        { from: shipper, value: total }
      );
 
      await escrow.reportMilestone(
        secondAgreementId,
        0,
        '',
        { from: carrier }
      );
 
      await escrow.verifyMilestone(
        secondAgreementId,
        0,
        { from: shipper }
      );
 
      const reputation =
        await token.balanceOf(carrier);
 
      assert.equal(
        reputation.toString(),
        '100'
      );
    });
  });
 
  // Deadline refund
  describe('checkAndRefund', () => {
    it('refunds the shipper if the deadline passes with unverified milestones', async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 100;
      const total = web3.utils.toWei('1', 'ether');
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      await escrow.acceptAgreement(0, { from: carrier });
      await escrow.fundAgreement(0, { from: shipper, value: total });
 
      await increaseTime(200); // push past the deadline
 
      const balBefore = new web3.utils.BN(await web3.eth.getBalance(shipper));
      await escrow.checkAndRefund(0, { from: stranger }); // anyone can trigger it
      const balAfter = new web3.utils.BN(await web3.eth.getBalance(shipper));
 
      assert(balAfter.gt(balBefore), 'shipper should be refunded');
      const a = await escrow.getAgreement(0);
      assert.equal(a.status.toString(), STATUS_REFUNDED);
 
      // Regression: releasedAmount must catch up so fundedAmount - releasedAmount
      // (the "in escrow" figure the UI shows) doesn't stay stuck at a phantom balance.
      assert.equal(a.releasedAmount.toString(), a.fundedAmount.toString());
    });
 
    it('leaves no phantom escrow balance after a partial payout + refund (regression)', async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 100;
      const total = web3.utils.toWei('1', 'ether');
      await escrow.createAgreement(
        carrier, total, deadline,
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [40, 60], agreementDetails,
        { from: shipper }
      );
      await escrow.acceptAgreement(0, { from: carrier });
      await escrow.fundAgreement(0, { from: shipper, value: total });
 
      // Release the first milestone before the deadline passes, so releasedAmount
      // is already non-zero when the refund of the remainder happens.
      await escrow.reportMilestone(0, 0, '', { from: carrier });
      await escrow.verifyMilestone(0, 0, { from: shipper });
 
      await increaseTime(200); // push past the deadline
      await escrow.checkAndRefund(0, { from: stranger });
 
      const a = await escrow.getAgreement(0);
      assert.equal(a.status.toString(), STATUS_REFUNDED);
      // releasedAmount should now equal fundedAmount exactly: the 40% milestone
      // payout plus the refunded 60% remainder, with nothing left "in escrow".
      assert.equal(a.releasedAmount.toString(), a.fundedAmount.toString());
      const remainingInEscrow = new web3.utils.BN(a.fundedAmount).sub(new web3.utils.BN(a.releasedAmount));
      assert.equal(remainingInEscrow.toString(), '0');
    });
  });
 
  // Disputes + evidence
  describe('raiseDispute / submitEvidence / resolveDispute', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });
 
    it('lets a participant raise a dispute with a predefined reason', async () => {
      await escrow.raiseDispute(agreementId, 2, '', { from: shipper });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_DISPUTED);
 
      const [reason, otherReason] = Object.values(await escrow.getDisputeReason(agreementId));
      assert.equal(reason.toString(), '2');
      assert.equal(otherReason, '');
    });
 
    it('requires an otherReason when dispute reason is "Other" (5)', async () => {
      await expectRevert(
        escrow.raiseDispute(agreementId, DISPUTE_OTHER, '', { from: shipper }),
        'Other reason required'
      );
    });
 
    it('rejects an invalid dispute reason', async () => {
      await expectRevert(
        escrow.raiseDispute(
          agreementId,
          6,
          '',
          { from: shipper }
        ),
       'Invalid dispute reason'
      );
    });
 
    it('rejects a non-empty otherReason on a predefined dispute reason', async () => {
      await expectRevert(
        escrow.raiseDispute(agreementId, 1, 'unexpected text', { from: shipper }),
        'Other reason should be empty'
      );
    });
 
    it('rejects a non-participant raising a dispute', async () => {
      await expectRevert(
        escrow.raiseDispute(agreementId, 1, '', { from: stranger }),
        'Not a participant'
      );
    });
 
    it('rejects a second dispute after the agreement is already disputed', async () => {
      await escrow.raiseDispute(
        agreementId,
        1,
        '',
        { from: shipper }
      );
 
      await expectRevert(
        escrow.raiseDispute(
          agreementId,
          2,
          '',
          { from: carrier }
        ),
        'Cannot dispute an inactive or finalized agreement'
      );
    });
 
    it('lets participants submit evidence while disputed, and it can be read back', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await escrow.submitEvidence(agreementId, 'Photo of damaged package', 'Qm123abc', { from: shipper });
      await escrow.submitEvidence(agreementId, 'Delivery confirmation', 'Qm456def', { from: carrier });
 
      const count = await escrow.getEvidenceCount(agreementId);
      assert.equal(count.toString(), '2');
 
      const e0 = await escrow.getEvidence(agreementId, 0);
      assert.equal(e0.submittedBy, shipper);
      assert.equal(e0.description, 'Photo of damaged package');
 
      const e1 = await escrow.getEvidence(agreementId, 1);
      assert.equal(e1.submittedBy, carrier);
    });

    it('keeps dispute evidence readable after the dispute is resolved', async () => {
      await escrow.raiseDispute(agreementId, 4, '', { from: shipper });
      await escrow.submitEvidence(agreementId, 'Photo of damaged package', '', { from: shipper });
      await escrow.resolveDispute(agreementId, true, { from: deployer });

      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_REFUNDED);
      assert.equal((await token.balanceOf(shipper)).toString(), '0');
      assert.equal((await escrow.getEvidenceCount(agreementId)).toString(), '1');
      const evidence = await escrow.getEvidence(agreementId, 0);
      assert.equal(evidence.description, 'Photo of damaged package');
      const reason = await escrow.getDisputeReason(agreementId);
      assert.equal(reason.reason.toString(), '4');
    });
 
    it('rejects evidence submission when the agreement is not disputed', async () => {
      await expectRevert(
        escrow.submitEvidence(agreementId, 'too early', 'Qm', { from: shipper }),
        'not disputed'
      );
    });
 
    it('rejects evidence with an empty description', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await expectRevert(
        escrow.submitEvidence(agreementId, '', 'Qm', { from: shipper }),
        'Description required'
      );
    });
 
    it('arbitrator can resolve in favour of the shipper (refund)', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: carrier });
      const balBefore = new web3.utils.BN(await web3.eth.getBalance(shipper));
      await escrow.resolveDispute(agreementId, true, { from: deployer }); // deployer == arbitrator
      const balAfter = new web3.utils.BN(await web3.eth.getBalance(shipper));
      assert(balAfter.gt(balBefore));
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_REFUNDED);
 
      // Regression: releasedAmount must catch up so fundedAmount - releasedAmount
      // (the "in escrow" figure the UI shows) doesn't stay stuck at a phantom balance.
      assert.equal(a.releasedAmount.toString(), a.fundedAmount.toString());
    });
 
    it('leaves no phantom escrow balance after a partial payout + dispute refund (regression)', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier, total, deadline,
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [40, 60], agreementDetails,
        { from: shipper }
      );
      const secondId = 1;
      await escrow.acceptAgreement(secondId, { from: carrier });
      await escrow.fundAgreement(secondId, { from: shipper, value: total });
 
      // Release the first milestone before the dispute is raised.
      await escrow.reportMilestone(secondId, 0, '', { from: carrier });
      await escrow.verifyMilestone(secondId, 0, { from: shipper });
 
      await escrow.raiseDispute(secondId, 1, '', { from: carrier });
      await escrow.resolveDispute(secondId, true, { from: deployer }); // refund the shipper
 
      const a = await escrow.getAgreement(secondId);
      assert.equal(a.status.toString(), STATUS_REFUNDED);
      assert.equal(a.releasedAmount.toString(), a.fundedAmount.toString());
      const remainingInEscrow = new web3.utils.BN(a.fundedAmount).sub(new web3.utils.BN(a.releasedAmount));
      assert.equal(remainingInEscrow.toString(), '0');
    });
 
    it('does not deduct commission when the dispute resolves in favour of the shipper', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: carrier });
      const earningsBefore = new web3.utils.BN(await escrow.arbitratorEarnings());
      await escrow.resolveDispute(agreementId, true, { from: deployer });
      const earningsAfter = new web3.utils.BN(await escrow.arbitratorEarnings());
      assert(earningsAfter.eq(earningsBefore), 'no commission should be taken on a shipper refund');
    });
 
    it('arbitrator can resolve in favour of the carrier (pay out minus commission + mint reputation)', async () => {
      const totalBN = new web3.utils.BN(total);
      const { commission, carrierAmount } = withCommission(totalBN);
 
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      const carrierBalBefore = new web3.utils.BN(await web3.eth.getBalance(carrier));
      const earningsBefore = new web3.utils.BN(await escrow.arbitratorEarnings());
 
      const receipt = await escrow.resolveDispute(agreementId, false, { from: deployer });
 
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_COMPLETED);
 
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '100');
      assert.equal((await escrow.completionReputationEarned(carrier)).toString(), '0');
      assert.equal((await escrow.disputeReputationEarned(carrier)).toString(), '100');
 
      const carrierBalAfter = new web3.utils.BN(await web3.eth.getBalance(carrier));
      assert.equal(carrierBalAfter.sub(carrierBalBefore).toString(), carrierAmount.toString());
 
      const earningsAfter = new web3.utils.BN(await escrow.arbitratorEarnings());
      assert.equal(earningsAfter.sub(earningsBefore).toString(), commission.toString());
 
      const event = receipt.logs.find(log => log.event === 'CommissionCollected');
      assert.exists(event, 'CommissionCollected should be emitted');
      assert.equal(event.args.amount.toString(), commission.toString());
    });
 
    it('rejects a non-arbitrator resolving a dispute', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await expectRevert(
        escrow.resolveDispute(agreementId, true, { from: stranger }),
        'Only arbitrator'
      );
    });
  });
 
  // Carrier accept/reject, and fundAgreement's dependency on Accepted status
  describe('acceptAgreement / rejectAgreement', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
    });
 
    it('moves a Created agreement to Accepted and emits AgreementAccepted', async () => {
      const receipt = await escrow.acceptAgreement(agreementId, { from: carrier });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_ACCEPTED);
      const event = receipt.logs.find(log => log.event === 'AgreementAccepted');
      assert.exists(event, 'AgreementAccepted should be emitted');
    });
 
    it('rejects acceptance from anyone other than the assigned carrier', async () => {
      await expectRevert(
        escrow.acceptAgreement(agreementId, { from: shipper }),
        "agreement's carrier"
      );
      await expectRevert(
        escrow.acceptAgreement(agreementId, { from: stranger }),
        "agreement's carrier"
      );
    });
 
    it('rejects accepting a second time once already Accepted', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await expectRevert(
        escrow.acceptAgreement(agreementId, { from: carrier }),
        'not in required status'
      );
    });
 
    it('moves a Created agreement to Rejected and emits AgreementRejected', async () => {
      const receipt = await escrow.rejectAgreement(agreementId, { from: carrier });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_REJECTED);
      const event = receipt.logs.find(log => log.event === 'AgreementRejected');
      assert.exists(event, 'AgreementRejected should be emitted');
    });
 
    it('rejects rejection from anyone other than the assigned carrier', async () => {
      await expectRevert(
        escrow.rejectAgreement(agreementId, { from: shipper }),
        "agreement's carrier"
      );
    });
 
    it('rejects rejecting an agreement that is no longer Created (e.g. already Accepted)', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await expectRevert(
        escrow.rejectAgreement(agreementId, { from: carrier }),
        'not in required status'
      );
    });
 
    it('never moves funds on rejection, so there is nothing to refund', async () => {
      // Shipper never funded and doesn't send this transaction, so their
      // balance should be completely untouched (carrier pays the gas).
      const shipperBalBefore = new web3.utils.BN(await web3.eth.getBalance(shipper));
      await escrow.rejectAgreement(agreementId, { from: carrier });
      const shipperBalAfter = new web3.utils.BN(await web3.eth.getBalance(shipper));
      assert.equal(shipperBalAfter.toString(), shipperBalBefore.toString());
    });
 
    it('lets the shipper fund only after the carrier accepts', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), STATUS_FUNDED);
    });
 
    it('rejects funding a Rejected agreement', async () => {
      await escrow.rejectAgreement(agreementId, { from: carrier });
      await expectRevert(
        escrow.fundAgreement(agreementId, { from: shipper, value: total }),
        'not in required status'
      );
    });
  });
 
  // Shipper-only deadline extension
  describe('extendDeadline', () => {
    let agreementId, deadline;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
    });
 
    it('lets the shipper push the deadline later while still Created, and emits DeadlineExtended', async () => {
      const newDeadline = deadline + 7200;
      const receipt = await escrow.extendDeadline(agreementId, newDeadline, { from: shipper });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.deadline.toString(), newDeadline.toString());
      const event = receipt.logs.find(log => log.event === 'DeadlineExtended');
      assert.exists(event, 'DeadlineExtended should be emitted');
      assert.equal(event.args.newDeadline.toString(), newDeadline.toString());
    });
 
    it('lets the shipper extend a Funded, active agreement', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      const newDeadline = deadline + 7200;
      await escrow.extendDeadline(agreementId, newDeadline, { from: shipper });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.deadline.toString(), newDeadline.toString());
    });
 
    it('rejects a new deadline that is not later than the current one', async () => {
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline, { from: shipper }),
        'must be later'
      );
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline - 100, { from: shipper }),
        'must be later'
      );
    });

    it('rejects a replacement deadline that is later than the old deadline but already in the past', async () => {
      await increaseTime(4000);
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 1, { from: shipper }),
        'New deadline must be in the future'
      );
    });
 
    it('rejects extension from a non-shipper', async () => {
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 7200, { from: carrier }),
        "agreement's shipper"
      );
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 7200, { from: stranger }),
        "agreement's shipper"
      );
    });
 
    it('rejects extension once the agreement is Completed', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 7200, { from: shipper }),
        'Agreement is closed'
      );
    });
 
    it('rejects extension once the agreement is Refunded', async () => {
      const shortDeadline = (await web3.eth.getBlock('latest')).timestamp + 100;
      await escrow.createAgreement(
        carrier,
        total,
        shortDeadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      const secondId = 1;
      await escrow.acceptAgreement(secondId, { from: carrier });
      await escrow.fundAgreement(secondId, { from: shipper, value: total });
      await increaseTime(200);
      await escrow.checkAndRefund(secondId, { from: stranger });
      await expectRevert(
        escrow.extendDeadline(secondId, shortDeadline + 7200, { from: shipper }),
        'Agreement is closed'
      );
    });
 
    it('rejects extension once the agreement is Disputed', async () => {
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 7200, { from: shipper }),
        'Agreement is closed'
      );
    });
 
    it('rejects extension once the agreement is Rejected', async () => {
      await escrow.rejectAgreement(agreementId, { from: carrier });
      await expectRevert(
        escrow.extendDeadline(agreementId, deadline + 7200, { from: shipper }),
        'Agreement is closed'
      );
    });
  });
 
  // Arbitrator commission on milestone payouts, and withdrawal
  describe('arbitrator commission on milestone payouts / withdrawCommission', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });
 
    it('deducts a 5% commission from the carrier payout and credits arbitratorEarnings', async () => {
      const totalBN = new web3.utils.BN(total);
      const { commission, carrierAmount } = withCommission(totalBN);
 
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      const carrierBalBefore = new web3.utils.BN(await web3.eth.getBalance(carrier));
      const receipt = await escrow.verifyMilestone(agreementId, 0, { from: shipper });
      const carrierBalAfter = new web3.utils.BN(await web3.eth.getBalance(carrier));
 
      assert.equal(carrierBalAfter.sub(carrierBalBefore).toString(), carrierAmount.toString());
 
      const earnings = new web3.utils.BN(await escrow.arbitratorEarnings());
      assert.equal(earnings.toString(), commission.toString());
 
      const event = receipt.logs.find(log => log.event === 'CommissionCollected');
      assert.exists(event, 'CommissionCollected should be emitted');
      assert.equal(event.args.amount.toString(), commission.toString());
    });
 
    it('accumulates commission across multiple milestones on the same agreement', async () => {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier, total, deadline,
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [50, 50], agreementDetails,
        { from: shipper }
      );
      const secondId = 1;
      await escrow.acceptAgreement(secondId, { from: carrier });
      await escrow.fundAgreement(secondId, { from: shipper, value: total });
 
      const half = new web3.utils.BN(total).div(new web3.utils.BN(2));
      const { commission: commissionEach } = withCommission(half);
 
      await escrow.reportMilestone(secondId, 0, '', { from: carrier });
      await escrow.verifyMilestone(secondId, 0, { from: shipper });
      await escrow.reportMilestone(secondId, 1, '', { from: carrier });
      await escrow.verifyMilestone(secondId, 1, { from: shipper });
 
      const earnings = new web3.utils.BN(await escrow.arbitratorEarnings());
      // Commission is charged separately on each milestone's payout, not on the agreement total at once
      assert.equal(earnings.toString(), commissionEach.mul(new web3.utils.BN(2)).toString());
    });
 
    it('lets the arbitrator withdraw accumulated commission and resets the balance', async () => {
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
 
      const earningsBefore = new web3.utils.BN(await escrow.arbitratorEarnings());
      assert(earningsBefore.gt(new web3.utils.BN(0)), 'commission should have accrued');
 
      const arbitratorBalBefore = new web3.utils.BN(await web3.eth.getBalance(deployer));
      const receipt = await escrow.withdrawCommission({ from: deployer });
      const arbitratorBalAfter = new web3.utils.BN(await web3.eth.getBalance(deployer));
 
      const tx = await web3.eth.getTransaction(receipt.tx);
      const gasCost = new web3.utils.BN(receipt.receipt.gasUsed).mul(new web3.utils.BN(tx.gasPrice));
      const expectedBalAfter = arbitratorBalBefore.sub(gasCost).add(earningsBefore);
 
      const earningsAfter = new web3.utils.BN(await escrow.arbitratorEarnings());
      assert.equal(earningsAfter.toString(), '0');
      assert.equal(arbitratorBalAfter.toString(), expectedBalAfter.toString());
 
      const event = receipt.logs.find(log => log.event === 'CommissionWithdrawn');
      assert.exists(event, 'CommissionWithdrawn should be emitted');
      assert.equal(event.args.amount.toString(), earningsBefore.toString());
    });
 
    it('rejects withdrawal from a non-arbitrator', async () => {
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
      await expectRevert(
        escrow.withdrawCommission({ from: shipper }),
        'Only arbitrator'
      );
    });
 
    it('rejects withdrawal when there is no commission to withdraw', async () => {
      await expectRevert(
        escrow.withdrawCommission({ from: deployer }),
        'No commission to withdraw'
      );
    });
  });
 
  // Arbitrator-adjustable reputation reward amounts
  describe('setCompletionReward / setDisputeWinReward', () => {
    let agreementId;
    const total = web3.utils.toWei('1', 'ether');
 
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await escrow.createAgreement(
        carrier,
        total,
        deadline,
        [MILESTONE_PICKUP],
        [""],
        [100],
        agreementDetails,
        { from: shipper }
      );
      agreementId = 0;
      await escrow.acceptAgreement(agreementId, { from: carrier });
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });
 
    it('mints the updated completion reward after setCompletionReward, and emits ReputationRewardsUpdated', async () => {
      const receipt = await escrow.setCompletionReward(250, { from: deployer });
      assert.equal((await escrow.completionReward()).toString(), '250');
      const event = receipt.logs.find(log => log.event === 'ReputationRewardsUpdated');
      assert.exists(event, 'ReputationRewardsUpdated should be emitted');
      assert.equal(event.args.completionReward.toString(), '250');
 
      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });
 
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '250');
    });
 
    it('mints the updated dispute-win reward after setDisputeWinReward', async () => {
      await escrow.setDisputeWinReward(300, { from: deployer });
      assert.equal((await escrow.disputeWinReward()).toString(), '300');
 
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await escrow.resolveDispute(agreementId, false, { from: deployer });
 
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '300');
    });
 
    it('rejects a non-arbitrator changing the completion reward', async () => {
      await expectRevert(
        escrow.setCompletionReward(999, { from: shipper }),
        'Only arbitrator'
      );
    });
 
    it('rejects a non-arbitrator changing the dispute-win reward', async () => {
      await expectRevert(
        escrow.setDisputeWinReward(999, { from: carrier }),
        'Only arbitrator'
      );
    });

    it('rejects zero-value reputation reward settings', async () => {
      await expectRevert(escrow.setCompletionReward(0, { from: deployer }), 'greater than zero');
      await expectRevert(escrow.setDisputeWinReward(0, { from: deployer }), 'greater than zero');
    });
  });
 
  // Carrier service profile (location + delivery types offered)
  describe('setCarrierProfile / getCarrierProfile', () => {
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
    });
 
    it('defaults to isSet = false before a carrier sets a profile', async () => {
      const p = await escrow.getCarrierProfile(carrier);
      assert.equal(p.isSet, false);
    });
 
    it('lets a carrier set a profile, readable via getCarrierProfile', async () => {
      await escrow.setCarrierProfile(5, 3, { from: carrier }); // location 5, Standard+Fast bitmask
      const p = await escrow.getCarrierProfile(carrier);
      assert.equal(p.location.toString(), '5');
      assert.equal(p.deliveryTypes.toString(), '3');
      assert.equal(p.isSet, true);
    });
 
    it('lets a carrier update their profile later (not a one-time setup)', async () => {
      await escrow.setCarrierProfile(1, 1, { from: carrier });
      await escrow.setCarrierProfile(9, 7, { from: carrier });
      const p = await escrow.getCarrierProfile(carrier);
      assert.equal(p.location.toString(), '9');
      assert.equal(p.deliveryTypes.toString(), '7');
    });
 
    it('rejects an out-of-range location', async () => {
      await expectRevert(escrow.setCarrierProfile(0, 1, { from: carrier }), 'Invalid location');
      await expectRevert(escrow.setCarrierProfile(16, 1, { from: carrier }), 'Invalid location');
    });
 
    it('rejects an out-of-range delivery-type bitmask', async () => {
      await expectRevert(escrow.setCarrierProfile(1, 0, { from: carrier }), 'Invalid delivery type bitmask');
      await expectRevert(escrow.setCarrierProfile(1, 8, { from: carrier }), 'Invalid delivery type bitmask');
    });
 
    it('rejects a non-carrier (e.g. a shipper) setting a carrier profile', async () => {
      await expectRevert(escrow.setCarrierProfile(1, 1, { from: shipper }), 'Only a registered Carrier');
    });
  });
 
  // AgreementDetails field validation (mirrors the range checks in createAgreement --
  // these are the source-of-truth checks; UI-side validation is only a courtesy layer)
  describe('createAgreement: AgreementDetails validation', () => {
    beforeEach(async () => {
      await escrow.registerUser(1, { from: shipper });
      await escrow.registerUser(2, { from: carrier });
    });
 
    function withDetails(overrides) {
      return Object.assign({}, agreementDetails, overrides);
    }
 
    async function expectDetailRevert(overrides, message) {
      const deadline = (await web3.eth.getBlock('latest')).timestamp + 3600;
      await expectRevert(
        escrow.createAgreement(
          carrier,
          web3.utils.toWei('1', 'ether'),
          deadline,
          [MILESTONE_PICKUP],
          [''],
          [100],
          withDetails(overrides),
          { from: shipper }
        ),
        message
      );
    }
 
    it('rejects an out-of-range origin', async () => {
      await expectDetailRevert({ origin: 0 }, 'Invalid origin');
      await expectDetailRevert({ origin: 16 }, 'Invalid origin');
    });
 
    it('rejects an out-of-range destination', async () => {
      await expectDetailRevert({ destination: 0 }, 'Invalid destination');
      await expectDetailRevert({ destination: 16 }, 'Invalid destination');
    });

    it('rejects an agreement whose origin and destination are the same', async () => {
      await expectDetailRevert({ destination: agreementDetails.origin }, 'Origin and destination must differ');
    });
 
    it('rejects an out-of-range item type', async () => {
      await expectDetailRevert({ itemType: 0 }, 'Invalid item type');
      await expectDetailRevert({ itemType: 7 }, 'Invalid item type');
    });
 
    it('rejects an out-of-range size', async () => {
      await expectDetailRevert({ size: 0 }, 'Invalid size');
      await expectDetailRevert({ size: 5 }, 'Invalid size');
    });
 
    it('rejects zero weight', async () => {
      await expectDetailRevert({ weight: 0 }, 'Weight must be greater than zero');
    });
 
    it('rejects an out-of-range delivery speed', async () => {
      await expectDetailRevert({ deliverySpeed: 0 }, 'Invalid delivery speed');
      await expectDetailRevert({ deliverySpeed: 5 }, 'Invalid delivery speed');
    });
 
    it('rejects an out-of-range guarantee tier', async () => {
      await expectDetailRevert({ guaranteeTier: 0 }, 'Invalid guarantee tier');
      await expectDetailRevert({ guaranteeTier: 4 }, 'Invalid guarantee tier');
    });
  });
});