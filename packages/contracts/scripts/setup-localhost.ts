import { ethers, network } from "hardhat";

/**
 * Places the canonical ERC-4337 v0.7 EntryPoint bytecode at
 * `0x0000000071727De22E5E9d8BAf0edAc6f37da032` on a Hardhat Network instance.
 *
 * Why: our Paymaster constructor calls `_validateEntryPointInterface(...)`,
 * which reverts if no contract exists at the passed address. On real chains
 * the singleton lives at the canonical address; on a fresh `hardhat node`
 * it doesn't, so Ignition's Paymaster deploy reverts with "Reverted without
 * reason". Running this script once before `ignition deploy --network
 * localhost` makes the localhost deploy match Sepolia/Base Sepolia reality.
 *
 * Safe to run against real testnets — it short-circuits if the bytecode is
 * already non-empty.
 */

const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log(`[setup-localhost] skipping — network '${network.name}' has the real EntryPoint.`);
    return;
  }

  const existing = await ethers.provider.getCode(ENTRY_POINT_V07);
  if (existing !== "0x") {
    console.log(`[setup-localhost] EntryPoint already at ${ENTRY_POINT_V07} (${existing.length / 2 - 1} bytes)`);
    return;
  }

  const EntryPoint = await ethers.getContractFactory(
    "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint",
  );
  const tempEp = await EntryPoint.deploy();
  await tempEp.waitForDeployment();
  const runtime = await ethers.provider.getCode(await tempEp.getAddress());
  await ethers.provider.send("hardhat_setCode", [ENTRY_POINT_V07, runtime]);
  console.log(
    `[setup-localhost] placed EntryPoint v0.7 runtime (${runtime.length / 2 - 1} bytes) at ${ENTRY_POINT_V07}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
