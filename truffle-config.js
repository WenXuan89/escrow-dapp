// truffle-config.js
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
      provider: () => new HDWalletProvider({
        mnemonic: { phrase: process.env.MNEMONIC },
        providerOrUrl: process.env.ALCHEMY_SEPOLIA_URL,
        pollingInterval: 12000,
        deploymentPollingInterval: 12000
      }),
      network_id: 11155111,
      gas: 5500000,
      gasPrice: 3000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
      networkCheckTimeout: 1000000
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