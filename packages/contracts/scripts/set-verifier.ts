import { ethers } from "hardhat";

/**
 * Update Paymaster.verifier to match the api's PAYMASTER_SIGNER_PRIVATE_KEY
 * address. Required so that api-signed sponsorships validate on-chain.
 *
 * Usage: npx hardhat run scripts/set-verifier.ts --network sepolia
 */

const PAYMASTER = "0xFd865997C431a3886cD23B9CC5BF1d13840b4Bc9";
const NEW_VERIFIER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  const [deployer] = await ethers.getSigners();
  const pm = await ethers.getContractAt("Paymaster", PAYMASTER, deployer);

  const current: string = await pm.verifier();
  console.log(`current verifier: ${current}`);
  if (current.toLowerCase() === NEW_VERIFIER.toLowerCase()) {
    console.log("already set — nothing to do");
    return;
  }
  const tx = await pm.setVerifier(NEW_VERIFIER);
  console.log(`setVerifier tx sent: ${tx.hash}`);
  await tx.wait();
  const after: string = await pm.verifier();
  console.log(`new verifier:     ${after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
