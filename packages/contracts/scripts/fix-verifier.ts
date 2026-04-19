import { ethers } from "hardhat";

/**
 * One-off: align the newly-deployed Paymaster's verifier with the key that
 * `apps/api` actually signs sponsorship requests with. Root .env.local and
 * apps/api/.env.local historically diverged — the deploy script read root,
 * the backend reads apps/api, producing an AA34 signature mismatch.
 */

const PAYMASTER = "0xa77447088b961861626c79D00d62e2024E7190B2";
// Address derived from apps/api/.env.local PAYMASTER_SIGNER_PRIVATE_KEY
// (Hardhat account #1). Stable and public — safe for Sepolia dev.
const APPS_API_VERIFIER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Paymaster = await ethers.getContractFactory("Paymaster");
  const pm = Paymaster.attach(PAYMASTER);

  const current: string = await pm.verifier();
  if (current.toLowerCase() === APPS_API_VERIFIER.toLowerCase()) {
    console.log(`[fix-verifier] already ${APPS_API_VERIFIER}`);
    return;
  }
  const tx = await pm.connect(deployer).setVerifier(APPS_API_VERIFIER);
  await tx.wait();
  console.log(`[fix-verifier] Paymaster.setVerifier(${APPS_API_VERIFIER})  was=${current}  tx=${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
