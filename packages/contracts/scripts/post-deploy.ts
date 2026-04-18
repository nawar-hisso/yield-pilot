import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Post-deploy wiring for YieldPilot:
 *   - Paymaster.setVerifier(<apps/api signer EOA>)
 *   - Paymaster.setTarget(YieldVault, true)
 *   - Paymaster.setBudget(YieldVault, 0.05 ether)
 *   - (optional) EntryPoint.depositTo(Paymaster) + addStake — only on real chains.
 *
 * Reads deployed addresses from ignition/deployments/chain-<id>/deployed_addresses.json.
 * Writes a short summary to deployments/<network>.json for downstream skills.
 */

const HH_ACCT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // matches apps/api PAYMASTER_SIGNER_PRIVATE_KEY in local dev

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const depPath = path.resolve(
    __dirname,
    `../ignition/deployments/chain-${chainId}/deployed_addresses.json`,
  );
  if (!fs.existsSync(depPath)) {
    throw new Error(`No deployed_addresses.json at ${depPath} — run \`ignition deploy\` first.`);
  }
  const addrs = JSON.parse(fs.readFileSync(depPath, "utf8")) as Record<string, string>;
  const vault = addrs["YieldPilotModule#YieldVault"];
  const paymaster = addrs["YieldPilotModule#Paymaster"];
  if (!vault || !paymaster) throw new Error("YieldVault or Paymaster address missing from deployment file");

  console.log(`[post-deploy] network=${network.name} chainId=${chainId}`);
  console.log(`[post-deploy] deployer=${deployer.address}`);
  console.log(`[post-deploy] Paymaster=${paymaster}  YieldVault=${vault}`);

  const Paymaster = await ethers.getContractFactory("Paymaster");
  const paymasterContract = Paymaster.attach(paymaster);

  // For localhost we align the verifier to apps/api's default signer
  // (Hardhat account #1). On real chains the user overrides via env.
  const verifier = process.env.PAYMASTER_VERIFIER ?? HH_ACCT_1;
  const budget = ethers.parseEther("0.05");

  const currentVerifier = await paymasterContract.verifier();
  if (currentVerifier.toLowerCase() !== verifier.toLowerCase()) {
    const tx = await paymasterContract.connect(deployer).setVerifier(verifier);
    await tx.wait();
    console.log(`[post-deploy] Paymaster.setVerifier(${verifier})`);
  } else {
    console.log(`[post-deploy] verifier already set to ${verifier}`);
  }

  if (!(await paymasterContract.allowedTargets(vault))) {
    const tx = await paymasterContract.connect(deployer).setTarget(vault, true);
    await tx.wait();
    console.log(`[post-deploy] Paymaster.setTarget(${vault}, true)`);
  }

  const currentBudget = await paymasterContract.gasBudget(vault);
  if (currentBudget !== budget) {
    const tx = await paymasterContract.connect(deployer).setBudget(vault, budget);
    await tx.wait();
    console.log(`[post-deploy] Paymaster.setBudget(${vault}, ${ethers.formatEther(budget)} ETH)`);
  }

  const summary = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    verifier,
    addresses: addrs,
    updatedAt: new Date().toISOString(),
  };

  const outDir = path.resolve(__dirname, "../../../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`[post-deploy] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
