const ReputationToken = artifacts.require("ReputationToken");
const Escrow = artifacts.require("Escrow");

contract("Escrow - Person C Tests", (accounts) => {
  let repToken;
  let escrow;

  const deployer = accounts[0];
  const carrier = accounts[2];

  beforeEach(async () => {
    // 1. Deploy fresh contract instances
    repToken = await ReputationToken.new({ from: deployer });
    escrow = await Escrow.new(repToken.address, { from: deployer });

    // 2. Set Escrow as minter on ReputationToken
    await repToken.setMinter(escrow.address, { from: deployer });
  });

  it("1. Should mint ReputationToken to Carrier when called by authorized minter", async () => {
    // Test minting directly using deployer before handing over, or test mint logic directly
    const testToken = await ReputationToken.new({ from: deployer });
    await testToken.mint(carrier, web3.utils.toWei("100", "ether"), { from: deployer });

    const balance = await testToken.balanceOf(carrier);
    assert.equal(
      web3.utils.fromWei(balance, "ether"),
      "100",
      "Carrier should have received 100 REP tokens"
    );
  });

  it("2. Should check ReputationToken minter assignment", async () => {
    const currentMinter = await repToken.minter();
    assert.equal(currentMinter, escrow.address, "Escrow contract should be set as minter");
  });
});