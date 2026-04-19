# @yield-pilot/contracts

Hardhat + Solidity workspace.

- `YieldVault.sol` — ERC-4626 vault routing deposits into `MockAave`
- `Paymaster.sol` — ERC-4337 paymaster with per-sender budget + `executeBatch` support
- `YieldPilotAccount.sol` — ERC-4337 smart account with WebAuthn (passkey) validation
- `YieldPilotAccountFactory.sol` — CREATE2 minimal-proxy factory for the account
- `mocks/MockUSDC.sol` — 6-dec test token with a faucet
- `mocks/MockAave.sol` — simulated lending pool with fixed APY

## Scripts

```bash
pnpm -F @yield-pilot/contracts compile
pnpm -F @yield-pilot/contracts test
pnpm -F @yield-pilot/contracts deploy:sepolia
pnpm -F @yield-pilot/contracts deploy:base-sepolia
```

ABIs are picked up by `@yield-pilot/contracts-abi` via `pnpm -F @yield-pilot/contracts-abi build`.
