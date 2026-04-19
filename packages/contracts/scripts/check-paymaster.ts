import { ethers } from "hardhat";

const PAYMASTER = "0xFd865997C431a3886cD23B9CC5BF1d13840b4Bc9";
const VAULT = "0x4662Bd4149CB412E1CdC08E2e3177974c16850AF";
const FACTORY = "0xe38f4049F7C18DE4fC9C48eb102134cC42027AC9";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  const [deployer] = await ethers.getSigners();
  const pm = await ethers.getContractAt("Paymaster", PAYMASTER, deployer);

  const verifier: string = await pm.verifier();
  const targetOk: boolean = await pm.allowedTargets(VAULT);
  const factoryOk: boolean = await pm.allowedFactories(FACTORY);
  const depOnEp: bigint = await pm.getDeposit();

  const epAbi = [
    "function getDepositInfo(address) view returns (uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)",
  ];
  const ep = new ethers.Contract(ENTRY_POINT, epAbi, deployer);
  const info = await ep.getDepositInfo(PAYMASTER);

  console.log("verifier:          ", verifier);
  console.log("vault allowed:     ", targetOk);
  console.log("factory allowed:   ", factoryOk);
  console.log("EP deposit (wei):  ", depOnEp.toString());
  console.log("EP staked:         ", info[1], " stake(wei):", info[2].toString(), "unstakeDelay:", info[3]);
}

main().catch((err) => { console.error(err); process.exit(1); });
