// Typechain only augments `getContractFactory`; supplement `getContractAt`
// so scripts/tests can reach typed bindings by string name.
import type { ethers } from "ethers";
import type * as Contracts from "../typechain-types";

type NamedContractMap = {
  MockAave: Contracts.MockAave;
  MockUSDC: Contracts.MockUSDC;
  Paymaster: Contracts.Paymaster;
  YieldVault: Contracts.YieldVault;
  YieldPilotAccount: Contracts.YieldPilotAccount;
  YieldPilotAccountFactory: Contracts.YieldPilotAccountFactory;
  EntryPoint: Contracts.EntryPoint;
  IEntryPoint: Contracts.IEntryPoint;
};

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers {
    getContractAt<K extends keyof NamedContractMap>(
      name: K,
      address: string,
      signer?: ethers.Signer
    ): Promise<NamedContractMap[K]>;
  }
}
