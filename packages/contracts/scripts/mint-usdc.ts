import { ethers } from "hardhat";

/**
 * Mint mUSDC to an arbitrary recipient with the deployer key. Used to seed
 * test accounts without going through the per-caller 1,000-unit faucet.
 *
 * Usage:
 *   TO=0xabc... AMOUNT=100000 npx hardhat run scripts/mint-usdc.ts --network sepolia
 *
 * AMOUNT is in whole mUSDC (we multiply by 10^6 for you).
 */

const MOCK_USDC = "0x2a046e7e9f0a0ce0a466F357adE6ccf171977BDc";

async function main() {
  const to = process.env.TO;
  const whole = process.env.AMOUNT;
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new Error("TO env var required (EVM address)");
  }
  if (!whole || !/^[0-9]+$/.test(whole)) {
    throw new Error("AMOUNT env var required (integer whole mUSDC units)");
  }
  const amount = BigInt(whole) * 10n ** 6n;

  const [deployer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("MockUSDC", MOCK_USDC, deployer);

  const before: bigint = await usdc.balanceOf(to);
  console.log(`balance before: ${before} (${before / 10n ** 6n} mUSDC)`);

  const tx = await usdc.mint(to, amount);
  console.log(`mint tx: ${tx.hash}`);
  await tx.wait();

  const after: bigint = await usdc.balanceOf(to);
  console.log(`balance after:  ${after} (${after / 10n ** 6n} mUSDC)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
