// Hardhat config: local network only (Shanghai hardfork, like Aevum).
// Real Aevum testnet deploys go through scripts/deploy.mjs with ethers directly;
// this file exists so `npx hardhat node` gives a local chain for end-to-end tests.
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { evmVersion: "shanghai", optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337, hardfork: "shanghai" },
    aevum: {
      url: process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info",
      chainId: 44005,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  paths: { sources: "./contracts", tests: "./test", artifacts: "./artifacts" },
};
