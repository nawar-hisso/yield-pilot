import { ethers, network } from "hardhat";

/**
 * Redeploy ONLY the YieldVault contract. Keeps the existing MockUSDC,
 * MockAave, Paymaster, Factory, and Account impl in place.
 *
 * Use when the vault's on-chain logic changes (e.g., auto-deploy to strategy
 * on deposit). ERC-4626 shares are per-vault, so any user with a position in
 * the old vault must withdraw there first and re-deposit into the new one.
 *
 * After this script runs:
 *   1. Update NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA in apps/web/.env.local
 *   2. Update VAULT_ADDRESS_SEPOLIA in apps/api/.env.local + root .env.local
 *   3. Call Paymaster.setTarget(<new-vault>, true) so the paymaster sponsors
 *      deposit/withdraw UserOps targeting it
 *   4. Redeploy the subgraph with the new address in subgraph.yaml
 *   5. Restart apps/api and apps/web
 */

function must(name: string, v: string | undefined): string {
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`${name} must be a 0x-prefixed EVM address (got ${v ?? "undefined"})`);
  }
  return v;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const usdc = must("USDC_ADDRESS_SEPOLIA", process.env.USDC_ADDRESS_SEPOLIA);
  const aave = must(
    "NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA",
    process.env.NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA,
  );
  const paymaster = must(
    "PAYMASTER_CONTRACT_ADDRESS_SEPOLIA",
    process.env.PAYMASTER_CONTRACT_ADDRESS_SEPOLIA,
  );

  console.log(`[redeploy-vault] network=${network.name} chainId=${chainId}`);
  console.log(`[redeploy-vault] deployer=${deployer.address}`);
  console.log(`[redeploy-vault] asset=${usdc}  strategy=${aave}  paymaster=${paymaster}`);

  const YieldVault = await ethers.getContractFactory("YieldVault");
  const vault = await YieldVault.deploy(usdc, aave, deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`[redeploy-vault] NEW YieldVault deployed at ${vaultAddr}`);

  // Wire the new vault into the existing Paymaster's target allow-list so
  // passkey deposit/withdraw UserOps targeting it are sponsored.
  const pm = await ethers.getContractAt("Paymaster", paymaster, deployer);
  const alreadyAllowed: boolean = await pm.allowedTargets(vaultAddr);
  if (!alreadyAllowed) {
    const tx = await pm.connect(deployer).setTarget(vaultAddr, true);
    await tx.wait();
    console.log(`[redeploy-vault] Paymaster.setTarget(${vaultAddr}, true)`);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  NEW VAULT ADDRESS: ${vaultAddr}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Update env files:`);
  console.log(`     apps/web/.env.local  → NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA=${vaultAddr}`);
  console.log(`     apps/api/.env.local  → VAULT_ADDRESS_SEPOLIA=${vaultAddr}`);
  console.log(`     .env.local (root)    → VAULT_ADDRESS_SEPOLIA=${vaultAddr}`);
  console.log(`  2. Update deployments/sepolia.json if you keep that file.`);
  console.log(`  3. Patch apps/subgraph/scripts/patch-manifest.ts source (or update`);
  console.log(`     deployments/sepolia.json the script reads from), then:`);
  console.log(`       pnpm -F @yield-pilot/subgraph deploy:sepolia`);
  console.log(`  4. Restart apps/api + apps/web.`);
  console.log("");
  console.log("Users with shares in the OLD vault must:");
  console.log(`  - Withdraw from old vault: go to /vault while env still points at the old`);
  console.log(`    address, withdraw 100%, then update env and deposit into the new vault.`);
  console.log(`  - OR accept the old position is stranded on testnet.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
