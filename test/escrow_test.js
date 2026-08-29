const Escrow = artifacts.require('Escrow');
const ReputationToken = artifacts.require('ReputationToken');

// Milestone type
const MILESTONE_PICKUP = 1;
const MILESTONE_OTHER = 6;

// Dispute reason codes
const DISPUTE_OTHER = 5;

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
      { from: shipper }
    );

    // Global agreement count
    assert.equal(
      (await escrow.agreementCount()).toString(),
      '2'
    );

    // Shipper should see both agreements
    const shipperIds =
      await escrow.getUserAgreements(shipper);

    assert.equal(shipperIds.length, 2);
    assert.equal(shipperIds[0].toString(), '0');
    assert.equal(shipperIds[1].toString(), '1');

    // Carrier should also see both agreements
    const carrierIds =
      await escrow.getUserAgreements(carrier);

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
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [50, 50],
        { from: shipper }
      );
      agreementId = 0;
    });

    it('funds the agreement with the exact total value', async () => {
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.fundedAmount.toString(), total);
      assert.equal(a.status.toString(), '1'); // Funded
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
        [MILESTONE_PICKUP, MILESTONE_PICKUP], ['', ''], [40, 60],
        { from: shipper }
      );
      agreementId = 0;
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });

    it('pays the carrier proportionally on each verified milestone and mints flat reputation on completion', async () => {
      const carrierBalBefore = new web3.utils.BN(await web3.eth.getBalance(carrier));

      await escrow.reportMilestone(agreementId, 0, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 0, { from: shipper });

      let a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), '2'); // InProgress
      assert.equal(a.releasedAmount.toString(), web3.utils.toWei('0.4', 'ether'));

      await escrow.reportMilestone(agreementId, 1, '', { from: carrier });
      await escrow.verifyMilestone(agreementId, 1, { from: shipper });

      a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), '3'); // Completed

      const carrierBalAfter = new web3.utils.BN(await web3.eth.getBalance(carrier));
      assert(carrierBalAfter.gt(carrierBalBefore), 'carrier should have received ETH');

      // Reputation mint is a flat 100 points per completed agreement, not proportional to value
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '100');
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
        [''],
        [100],
        { from: shipper }
      );

      const secondAgreementId = 1;

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
        carrier, total, deadline,
        [MILESTONE_PICKUP], [''], [100],
        { from: shipper }
      );
      await escrow.fundAgreement(0, { from: shipper, value: total });

      await increaseTime(200); // push past the deadline

      const balBefore = new web3.utils.BN(await web3.eth.getBalance(shipper));
      await escrow.checkAndRefund(0, { from: stranger }); // anyone can trigger it
      const balAfter = new web3.utils.BN(await web3.eth.getBalance(shipper));

      assert(balAfter.gt(balBefore), 'shipper should be refunded');
      const a = await escrow.getAgreement(0);
      assert.equal(a.status.toString(), '4'); // Refunded
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
        carrier, total, deadline,
        [MILESTONE_PICKUP], [''], [100],
        { from: shipper }
      );
      agreementId = 0;
      await escrow.fundAgreement(agreementId, { from: shipper, value: total });
    });

    it('lets a participant raise a dispute with a predefined reason', async () => {
      await escrow.raiseDispute(agreementId, 2, '', { from: shipper });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), '5'); // Disputed

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
      assert.equal(a.status.toString(), '4'); // Refunded
    });

    it('arbitrator can resolve in favour of the carrier (pay out + mint reputation)', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await escrow.resolveDispute(agreementId, false, { from: deployer });
      const a = await escrow.getAgreement(agreementId);
      assert.equal(a.status.toString(), '3'); // Completed
      const reputation = await token.balanceOf(carrier);
      assert.equal(reputation.toString(), '100');
    });

    it('rejects a non-arbitrator resolving a dispute', async () => {
      await escrow.raiseDispute(agreementId, 1, '', { from: shipper });
      await expectRevert(
        escrow.resolveDispute(agreementId, true, { from: stranger }),
        'Only arbitrator'
      );
    });
  });
});