import { ethers, network } from 'hardhat';

/**
 * Manual deploy. CI builds and tests contracts but never publishes bytecode —
 * putting code on a chain is irreversible and stays a deliberate human action.
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error('no signer available: set DEPLOYER_PRIVATE_KEY for this network');
  }

  const escrow = await ethers.deployContract('Escrow');
  await escrow.waitForDeployment();

  console.log(`Escrow deployed to ${await escrow.getAddress()} on ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
