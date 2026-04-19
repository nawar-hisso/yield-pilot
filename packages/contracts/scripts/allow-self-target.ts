import { ethers } from "hardhat";

/**
 * Allow-list a YieldPilotAccount address as a paymaster target so it can
 * sponsor self-calls (addAuthorizedKey / revokeKey). One-off ops hack until
 * Paymaster.sol is patched to special-case `target == userOp.sender`.
 *
 * Usage:
 *   ACCOUNT=0xabc...def npx hardhat run scripts/allow-self-target.ts --network sepolia
 */

const PAYMASTER = "0xFd865997C431a3886cD23B9CC5BF1d13840b4Bc9";

async function main() {
  const account = process.env.ACCOUNT;
  if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
    throw new Error("ACCOUNT env var required (EVM address of the smart account to allow-list)");
  }

  const [deployer] = await ethers.getSigners();
  const pm = await ethers.getContractAt("Paymaster", PAYMASTER, deployer);

  const already: boolean = await pm.allowedTargets(account);
  if (already) {
    console.log(`${account} already allow-listed`);
    return;
  }
  const tx = await pm.setTarget(account, true);
  console.log(`setTarget(${account}, true) → tx ${tx.hash}`);
  await tx.wait();
  const after: boolean = await pm.allowedTargets(account);
  console.log(`allowedTargets[${account}] = ${after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
