import '@nomicfoundation/hardhat-toolbox';
import type { HardhatUserConfig } from 'hardhat/config';

// Deployment keys are never read from a committed file. They come from the
// environment, and are empty everywhere except a deliberate manual deploy.
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: false,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? '',
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
  },
};

export default config;
