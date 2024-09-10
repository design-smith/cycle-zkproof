require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const MAINNET_RPC_URL = process.env.MAINNET;
const TESTNET_RPC_URL = process.env.TESTNET;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: MAINNET_RPC_URL,
      }
    },
    polygon: {
      url: MAINNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 137,
    },
    mumbai: {
      url: TESTNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 80001,
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  },
  etherscan: {
    apiKey: {
      polygon: "YOUR_POLYGONSCAN_API_KEY",
      polygonMumbai: "YOUR_POLYGONSCAN_API_KEY"
    }
  }
};