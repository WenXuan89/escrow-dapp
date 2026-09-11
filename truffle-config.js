// truffle-config.js
const EtherscanPlugin = require('truffle-plugin-verify');
const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },

    // Infura (if it works)
    sepolia: {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`
      ),
      network_id: 11155111,
      gas: 5500000,
      gasPrice: 3000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },

    // Alchemy (backup)
    "sepolia-alchemy": {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
      ),
      network_id: 11155111,
      gas: 5500000,
      gasPrice: 3000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },

    // Public RPC
    "sepolia-public": {
      provider: () => new HDWalletProvider(
        process.env.MNEMONIC,
        "https://rpc.sepolia.org"
      ),
      network_id: 11155111,
      gas: 5500000,
      gasPrice: 3000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    }
  },

  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    },
  },

  plugins: ['truffle-plugin-verify'],
  api_keys: {
    etherscan: process.env.ETHERSCAN_KEY
}
};