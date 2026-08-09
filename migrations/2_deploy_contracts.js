const ReputationToken = artifacts.require("ReputationToken");
const Escrow = artifacts.require("Escrow");

module.exports = async function (deployer) {
    await deployer.deploy(ReputationToken);
    const token = await ReputationToken.deployed();
    await deployer.deploy(Escrow, token.address);
    const escrow = await Escrow.deployed();

    // Set Escrow contract as the authorized minter on ReputationToken
    await token.setMinter(escrow.address);
};