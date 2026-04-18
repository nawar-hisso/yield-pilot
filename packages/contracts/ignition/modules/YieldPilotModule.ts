import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/// YieldPilot deployment module.
export default buildModule("YieldPilotModule", (m) => {
  const deployer = m.getAccount(0);

  const usdc = m.contract("MockUSDC", [deployer]);
  const aave = m.contract("MockAave", [deployer]);

  const vault = m.contract("YieldVault", [usdc, aave, deployer], {
    after: [usdc, aave],
  });

  const paymaster = m.contract("Paymaster", [deployer]);

});
