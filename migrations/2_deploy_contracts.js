const ReputationToken = artifacts.require("ReputationToken");
const Escrow = artifacts.require("Escrow");

module.exports = async function (deployer) {
    await deployer.deploy(ReputationToken);
    const token = await ReputationToken.deployed();
    await deployer.deploy(Escrow, token.address);
<<<<<<< HEAD
    const escrow = await Escrow.deployed();

    // Set Escrow contract as the authorized minter on ReputationToken
    await token.setMinter(escrow.address);
=======
>>>>>>> c56233ca36b00172efd8b50b0439a7375176d7e4
};