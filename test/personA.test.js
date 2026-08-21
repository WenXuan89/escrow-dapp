// test/personA.test.js
//
// Covers: registerUser, getAllCarriers, createAgreement, getAgreement,
// getMilestone, getMilestoneCount, and the guard checks on reportMilestone.
//
// ASSUMPTION FLAGGED: ReputationToken's constructor is assumed to take no
// arguments (ReputationToken.new() below). If your actual ReputationToken.sol
// has a constructor that needs arguments, this will fail on the `before()`
// block below — send me that file and I'll fix this one line.
//
// KNOWN GAP: reportMilestone() can only be tested for its guard conditions
// (wrong caller, agreement not funded) — NOT the successful reporting path —
// because there is currently no fundAgreement() function in Escrow.sol to
// move an agreement from "Created" to "Funded" status. Once that function
// exists, add a "happy path" describe block here that funds an agreement
// first, then tests a successful reportMilestone() call.

const Escrow = artifacts.require("Escrow");
const ReputationToken = artifacts.require("ReputationToken");

contract("Escrow - Person A functions", (accounts) => {
  const [deployer, shipper, carrier, randomUser] = accounts;

  let escrow;
  let reputationToken;

  before(async () => {
    reputationToken = await ReputationToken.new({ from: deployer });
    escrow = await Escrow.new(reputationToken.address, { from: deployer });
  });

  describe("registerUser()", () => {
    it("registers a Shipper", async () => {
      await escrow.registerUser(1, { from: shipper }); // 1 = Role.Shipper
      const role = await escrow.userRole(shipper);
      assert.equal(role.toString(), "1", "Shipper role not set correctly");
    });

    it("registers a Carrier and adds them to carrierList", async () => {
      await escrow.registerUser(2, { from: carrier }); // 2 = Role.Carrier
      const role = await escrow.userRole(carrier);
      assert.equal(role.toString(), "2", "Carrier role not set correctly");

      const carriers = await escrow.getAllCarriers();
      assert(carriers.includes(carrier), "Carrier not added to carrierList");
    });

    it("rejects double registration", async () => {
      try {
        await escrow.registerUser(1, { from: shipper }); // already registered above
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("Already registered"), `Wrong revert reason: ${err.message}`);
      }
    });

    it("rejects an invalid role (0 = None)", async () => {
      try {
        await escrow.registerUser(0, { from: randomUser });
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("Invalid role"), `Wrong revert reason: ${err.message}`);
      }
    });
  });

  describe("createAgreement()", () => {
    it("creates an agreement with milestones summing to 100", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await escrow.createAgreement(
        carrier,
        web3.utils.toWei("1", "ether"),
        deadline,
        ["Pickup", "In-transit", "Delivery"],
        [30, 20, 50],
        { from: shipper }
      );

      const agreement = await escrow.getAgreement(0);
      assert.equal(agreement.shipper, shipper, "Wrong shipper stored");
      assert.equal(agreement.carrier, carrier, "Wrong carrier stored");
      assert.equal(agreement.status.toString(), "0", "New agreement should be status Created (0)");

      const count = await escrow.getMilestoneCount(0);
      assert.equal(count.toString(), "3", "Wrong milestone count");

      const m0 = await escrow.getMilestone(0, 0);
      assert.equal(m0.description, "Pickup");
      assert.equal(m0.payoutPercentage.toString(), "30");
      assert.equal(m0.reported, false);
      assert.equal(m0.completed, false);
    });

    it("rejects a non-Shipper trying to create an agreement", async () => {
      try {
        await escrow.createAgreement(
          carrier, web3.utils.toWei("1", "ether"),
          Math.floor(Date.now() / 1000) + 3600,
          ["A"], [100],
          { from: carrier } // carrier, not shipper
        );
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("Only a Shipper"), `Wrong revert reason: ${err.message}`);
      }
    });

    it("rejects milestone percentages that don't sum to 100", async () => {
      try {
        await escrow.createAgreement(
          carrier, web3.utils.toWei("1", "ether"),
          Math.floor(Date.now() / 1000) + 3600,
          ["A", "B"], [40, 40],
          { from: shipper }
        );
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("sum to 100"), `Wrong revert reason: ${err.message}`);
      }
    });

    it("rejects a deadline in the past", async () => {
      try {
        await escrow.createAgreement(
          carrier, web3.utils.toWei("1", "ether"),
          1, // far in the past
          ["A"], [100],
          { from: shipper }
        );
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("future"), `Wrong revert reason: ${err.message}`);
      }
    });

    it("rejects naming an unregistered address as carrier", async () => {
      try {
        await escrow.createAgreement(
          randomUser, // never registered
          web3.utils.toWei("1", "ether"),
          Math.floor(Date.now() / 1000) + 3600,
          ["A"], [100],
          { from: shipper }
        );
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("registered Carrier"), `Wrong revert reason: ${err.message}`);
      }
    });
  });

  describe("reportMilestone() — guard checks only (see file header note)", () => {
    it("rejects reporting on an agreement that isn't funded yet", async () => {
      try {
        await escrow.reportMilestone(0, 0, { from: carrier });
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("not funded"), `Wrong revert reason: ${err.message}`);
      }
    });

    it("rejects a non-carrier trying to report", async () => {
      try {
        await escrow.reportMilestone(0, 0, { from: randomUser });
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("Not the carrier"), `Wrong revert reason: ${err.message}`);
      }
    });
  });

  describe("getters on a non-existent agreement", () => {
    it("getAgreement reverts for an invalid ID", async () => {
      try {
        await escrow.getAgreement(999);
        assert.fail("Expected revert did not occur");
      } catch (err) {
        assert(err.message.includes("does not exist"), `Wrong revert reason: ${err.message}`);
      }
    });
  });
});
