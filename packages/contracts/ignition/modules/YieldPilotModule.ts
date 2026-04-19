import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/// YieldPilot deployment module.
///
/// Deploy order:
///   MockUSDC · MockAave (parallel) → YieldVault
///   → YieldPilotAccount (impl) → YieldPilotAccountFactory
///   → Paymaster (verifier set later via setVerifier)
///
/// Canonical EntryPoint v0.7 singleton (same address on every chain):
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export default buildModule("YieldPilotModule", (m) => {
  const deployer = m.getAccount(0);

  // `initialVerifier` is a parameter so we can set a temporary value at deploy
  // time. The real backend signer is configured via Paymaster.setVerifier(...)
  // from the post-deploy wiring script once apps/api is running.
  const initialVerifier = m.getParameter("initialVerifier", deployer);

  // --- Tokens + strategy ---
  const usdc = m.contract("MockUSDC", [deployer]);
  const aave = m.contract("MockAave", [deployer]);

  const vault = m.contract("YieldVault", [usdc, aave, deployer], {
    after: [usdc, aave],
  });

  // --- Smart account (ERC-4337) ---
  const accountImpl = m.contract("YieldPilotAccount", [ENTRY_POINT_V07]);
  const accountFactory = m.contract("YieldPilotAccountFactory", [accountImpl], {
    after: [accountImpl],
  });

  // --- Paymaster (sponsors account.execute calls) ---
  const paymaster = m.contract("Paymaster", [ENTRY_POINT_V07, initialVerifier, deployer]);

  return { usdc, aave, vault, accountImpl, accountFactory, paymaster };
});
