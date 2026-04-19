import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

/**
 * Redeploy ONLY the Paymaster contract — the rest of the system (Vault,
 * Factory, Account impl) stays in place. Use when the Paymaster's on-chain
 * policy changes (e.g., adding executeBatch support).
 *
 * ⚠  apps/api is the runtime source of truth for the sponsorship signer.
 *    This script LOADS apps/api/.env.local explicitly and cross-checks it
 *    against whatever key Hardhat already loaded from root .env.local.
 *    If the two disagree the script bails out — otherwise the new paymaster's
 *    verifier would drift away from what apps/api actually signs with, which
 *    produces AA34 (paymaster signature) errors for every UserOp.
 *
 * Reads all prior addresses + the signer from env. Writes the new Paymaster
 *   - apps/api/.env.local          (PAYMASTER_CONTRACT_ADDRESS_SEPOLIA)
 *   - apps/web/.env.local          (NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS_SEPOLIA)
 *   - .env.local (root)            (PAYMASTER_CONTRACT_ADDRESS_SEPOLIA)
 *
 * PRE_ALLOWED_SENDERS (comma-separated addresses) can be set so the new
 * paymaster accepts UserOps from already-deployed smart accounts whose next
 * UserOp carries empty initCode. Without this, the sender-allowlist would
 * treat the known account as unknown and reject it.
 */

/**
 * Resolve the sponsorship signer, preferring apps/api/.env.local (the
 * runtime source of truth). Throws on any mismatch with an already-loaded
 * root-level value.
 */
function resolveSigner(): { privateKey: string; address: string } {
  const rootKey = process.env.PAYMASTER_SIGNER_PRIVATE_KEY;
  const apiEnvPath = path.resolve(__dirname, "../../../apps/api/.env.local");
  if (!fs.existsSync(apiEnvPath)) {
    if (!rootKey) throw new Error("No PAYMASTER_SIGNER_PRIVATE_KEY in root .env.local and no apps/api/.env.local to fall back on");
    const pk = rootKey;
    return { privateKey: pk, address: new ethers.Wallet(pk).address };
  }
  const apiEnv = dotenv.parse(fs.readFileSync(apiEnvPath));
  const apiKey = apiEnv.PAYMASTER_SIGNER_PRIVATE_KEY;
  if (!apiKey) throw new Error(`apps/api/.env.local has no PAYMASTER_SIGNER_PRIVATE_KEY`);
  if (rootKey && rootKey.toLowerCase() !== apiKey.toLowerCase()) {
    throw new Error(
      `PAYMASTER_SIGNER_PRIVATE_KEY divergence:\n` +
      `  root .env.local    → ${new ethers.Wallet(rootKey).address}\n` +
      `  apps/api/.env.local → ${new ethers.Wallet(apiKey).address}\n` +
      `Pick one (apps/api is the runtime signer) and sync both files.`,
    );
  }
  return { privateKey: apiKey, address: new ethers.Wallet(apiKey).address };
}

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const ENTRYPOINT_ABI = [
  "function depositTo(address account) external payable",
  "function balanceOf(address account) external view returns (uint256)",
];

function must(name: string, value: string | undefined): string {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} env var must be a 0x-prefixed EVM address (got ${value ?? "undefined"})`);
  }
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const vault = must("VAULT_ADDRESS_SEPOLIA", process.env.VAULT_ADDRESS_SEPOLIA);
  const factory = must("ACCOUNT_FACTORY_ADDRESS_SEPOLIA", process.env.ACCOUNT_FACTORY_ADDRESS_SEPOLIA);
  const usdc = must("USDC_ADDRESS_SEPOLIA", process.env.USDC_ADDRESS_SEPOLIA);

  // Verifier = the address of whatever key apps/api signs sponsorship
  // requests with. resolveSigner() enforces that root and apps/api agree.
  // Explicit PAYMASTER_VERIFIER override still wins for advanced setups.
  let verifier = process.env.PAYMASTER_VERIFIER;
  if (!verifier) {
    verifier = resolveSigner().address;
  }

  const preAllowedRaw = process.env.PRE_ALLOWED_SENDERS ?? "";
  const preAllowed = preAllowedRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s));

  const budget = ethers.parseEther(process.env.PAYMASTER_BUDGET_ETH ?? "0.05");

  console.log(`[redeploy] network=${network.name} chainId=${chainId}`);
  console.log(`[redeploy] deployer=${deployer.address}`);
  console.log(`[redeploy] vault=${vault}  factory=${factory}  usdc=${usdc}`);
  console.log(`[redeploy] verifier=${verifier}`);
  if (preAllowed.length > 0) {
    console.log(`[redeploy] pre-allowed senders: ${preAllowed.join(", ")}`);
  }

  const Paymaster = await ethers.getContractFactory("Paymaster");
  const pm = await Paymaster.deploy(ENTRYPOINT_V07, verifier, deployer.address);
  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();
  console.log(`[redeploy] NEW Paymaster deployed at ${pmAddr}`);

  // Factory allow-list.
  const tx1 = await pm.connect(deployer).setFactory(factory, true);
  await tx1.wait();
  console.log(`[redeploy] setFactory(${factory}, true)`);

  // Target allow-list — Vault + USDC (approve UserOps land here).
  const tx2 = await pm.connect(deployer).setTarget(vault, true);
  await tx2.wait();
  console.log(`[redeploy] setTarget(${vault}, true)`);

  const tx3 = await pm.connect(deployer).setTarget(usdc, true);
  await tx3.wait();
  console.log(`[redeploy] setTarget(${usdc}, true)`);

  for (const sender of preAllowed) {
    const tx = await pm.connect(deployer).setAllowedSender(sender, true);
    await tx.wait();
    console.log(`[redeploy] setAllowedSender(${sender}, true)`);
  }

  // Lifetime budget per sender (cap the per-account gas exposure). Applied
  // to the vault target purely as a default; in practice you'd call
  // setBudget per-sender once you know the addresses.
  const tx4 = await pm.connect(deployer).setBudget(vault, budget);
  await tx4.wait();
  console.log(`[redeploy] setBudget(${vault}, ${ethers.formatEther(budget)} ETH)`);

  // EntryPoint.depositTo — prefund gas sponsorship.
  const ep = new ethers.Contract(ENTRYPOINT_V07, ENTRYPOINT_ABI, deployer);
  const depositAmount = ethers.parseEther(process.env.PAYMASTER_DEPOSIT_ETH ?? "0.1");
  const tx5 = await ep.depositTo(pmAddr, { value: depositAmount });
  await tx5.wait();
  console.log(`[redeploy] EntryPoint.depositTo(${pmAddr}, ${ethers.formatEther(depositAmount)} ETH)`);

  // Paymaster stake (bundler req: 1-day unstake delay).
  const stakeAmount = ethers.parseEther(process.env.PAYMASTER_STAKE_ETH ?? "0.01");
  const tx6 = await pm.connect(deployer).addStake(86400, { value: stakeAmount });
  await tx6.wait();
  console.log(`[redeploy] addStake(86400, ${ethers.formatEther(stakeAmount)} ETH)`);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  NEW PAYMASTER ADDRESS: ${pmAddr}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Copy into:");
  console.log(`  apps/api/.env.local:  PAYMASTER_CONTRACT_ADDRESS_SEPOLIA=${pmAddr}`);
  console.log(`  apps/web/.env.local:  NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS_SEPOLIA=${pmAddr}`);
  console.log(`  .env.local (root):    PAYMASTER_CONTRACT_ADDRESS_SEPOLIA=${pmAddr}`);
  console.log("");
  console.log("Then restart apps/api and apps/web.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
