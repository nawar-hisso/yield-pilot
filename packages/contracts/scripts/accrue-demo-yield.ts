import { ethers } from "hardhat";

/**
 * Make the YieldVault actually earn so P&L and APY become non-zero on the dashboard.
 *
 * Steps this script performs (as the vault owner / deployer):
 *   1. Approves the MockAave strategy to pull USDC from the vault (if not already)
 *   2. Reads idle balance on the vault and deploys ALL of it to MockAave
 *   3. Optionally sets MockAave's APY to a demo-friendly rate (env APY_BPS)
 *
 * Usage:
 *   VAULT=0x4662…  MOCK_AAVE=0xaBeC…  USDC=0x2a04…  APY_BPS=50000 \
 *   npx hardhat --network sepolia run scripts/accrue-demo-yield.ts
 *
 * Defaults — VAULT/MOCK_AAVE/USDC fall back to the env names used elsewhere
 * in this repo. APY_BPS=50_000 (500%) makes yield visible in minutes instead
 * of days. Production would be closer to 500 (5%).
 */

function must(name: string, value: string | undefined): string {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed EVM address (got ${value ?? "undefined"})`);
  }
  return value;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const vault = must(
    "VAULT / VAULT_ADDRESS_SEPOLIA",
    process.env.VAULT ?? process.env.VAULT_ADDRESS_SEPOLIA,
  );
  const mockAave = must(
    "MOCK_AAVE / NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA",
    process.env.MOCK_AAVE ?? process.env.NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA,
  );
  const usdc = must(
    "USDC / USDC_ADDRESS_SEPOLIA",
    process.env.USDC ?? process.env.USDC_ADDRESS_SEPOLIA,
  );

  console.log(`[accrue] signer=${signer.address}`);
  console.log(`[accrue] vault=${vault}  strategy=${mockAave}  usdc=${usdc}`);

  const vaultContract = await ethers.getContractAt("YieldVault", vault, signer);
  const aave = await ethers.getContractAt("MockAave", mockAave, signer);
  const usdcContract = await ethers.getContractAt("MockUSDC", usdc, signer);

  const idle: bigint = await usdcContract.balanceOf(vault);
  console.log(`[accrue] vault idle balance: ${Number(idle) / 1_000_000} USDC`);

  if (idle === 0n) {
    console.log(`[accrue] nothing idle to deploy — make a deposit first then rerun.`);
  } else {
    const tx = await vaultContract.deployToStrategy(idle);
    console.log(`[accrue] deployToStrategy(${idle}) tx=${tx.hash}`);
    await tx.wait();
  }

  const apyRaw = process.env.APY_BPS;
  if (apyRaw && /^\d+$/.test(apyRaw)) {
    const bps = BigInt(apyRaw);
    const tx = await aave.setApyBps(bps);
    console.log(`[accrue] MockAave.setApyBps(${bps})  tx=${tx.hash}`);
    await tx.wait();
    console.log(`[accrue] APY set to ${Number(bps) / 100}%`);
  } else {
    const bps: bigint = await aave.apyBps();
    console.log(`[accrue] MockAave.apyBps unchanged (${Number(bps) / 100}%)`);
  }

  const parked: bigint = await aave.getBalance(usdc, vault);
  const totalAssets: bigint = await vaultContract.totalAssets();
  console.log(`[accrue] strategy balance (incl. accrued): ${Number(parked) / 1_000_000} USDC`);
  console.log(`[accrue] vault totalAssets: ${Number(totalAssets) / 1_000_000} USDC`);

  console.log("");
  console.log("Yield is now accruing lazily. To update the dashboard:");
  console.log("  1. Make a small deposit or withdraw from any account → new SharePriceSnapshot");
  console.log("  2. Refresh the dashboard — P&L and APY tick up");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
