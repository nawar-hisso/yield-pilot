import { ethers } from "hardhat";

/**
 * Second pass of post-deploy wiring for the multi-key Paymaster (Day 1
 * contract changes). Adds:
 *   - Paymaster.setFactory(factory, true) — allow UserOps whose sender is a
 *     YieldPilotAccount clone deployed by this factory.
 *   - EntryPoint.depositTo{0.1 ETH}(paymaster) — prefund gas sponsorship.
 *   - Paymaster.addStake{0.01 ETH}(86400) — 1-day unstake delay (bundler req).
 */

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER = "0xFd865997C431a3886cD23B9CC5BF1d13840b4Bc9";
const FACTORY = "0xe38f4049F7C18DE4fC9C48eb102134cC42027AC9";

const ENTRYPOINT_ABI = [
  "function depositTo(address account) external payable",
  "function balanceOf(address account) external view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const pm = await ethers.getContractAt("Paymaster", PAYMASTER, deployer);

  // 1. Factory allow-list
  const isAllowed: boolean = await pm.allowedFactories(FACTORY);
  if (!isAllowed) {
    const tx = await pm.connect(deployer).setFactory(FACTORY, true);
    await tx.wait();
    console.log(`[extra] Paymaster.setFactory(${FACTORY}, true) — tx ${tx.hash}`);
  } else {
    console.log(`[extra] factory already allowed`);
  }

  // 2. EntryPoint deposit
  const ep = new ethers.Contract(ENTRYPOINT_V07, ENTRYPOINT_ABI, deployer);
  const currentDeposit: bigint = await ep.balanceOf(PAYMASTER);
  const targetDeposit = ethers.parseEther("0.1");
  if (currentDeposit < targetDeposit) {
    const missing = targetDeposit - currentDeposit;
    const tx = await ep.depositTo(PAYMASTER, { value: missing });
    await tx.wait();
    console.log(`[extra] EntryPoint.depositTo(${PAYMASTER}, ${ethers.formatEther(missing)} ETH) — tx ${tx.hash}`);
  } else {
    console.log(`[extra] deposit already ${ethers.formatEther(currentDeposit)} ETH`);
  }

  // 3. Paymaster stake (goes to EntryPoint internally)
  const tx = await pm.connect(deployer).addStake(86400, { value: ethers.parseEther("0.01") });
  await tx.wait();
  console.log(`[extra] Paymaster.addStake(86400, 0.01 ETH) — tx ${tx.hash}`);

  console.log(`[extra] done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
