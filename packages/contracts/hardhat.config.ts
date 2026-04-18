import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";
import * as dotenv from "dotenv";
import { resolve } from "node:path";

// Load the monorepo-root .env.local first, then allow package-level override.
dotenv.config({ path: resolve(__dirname, "../../.env.local") });
dotenv.config({ path: resolve(__dirname, ".env.local"), override: true });

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];
const etherscanKey = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      url: process.env.RPC_URL_SEPOLIA ?? "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: deployerKey,
    },
    "base-sepolia": {
      url: process.env.RPC_URL_BASE_SEPOLIA ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts: deployerKey,
    },
  },
  etherscan: {
    apiKey: etherscanKey,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
