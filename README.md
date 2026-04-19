<div align="center">

# YieldPilot

**Gasless DeFi yield, sealed with your face.**

A portfolio-grade DeFi yield dashboard on Sepolia. Deposit USDC into an
ERC-4626 vault, earn simulated yield, and pay zero gas — either by
connecting an existing wallet (Reown AppKit) or by creating a
self-custodial **passkey** smart account (ERC-4337 + WebAuthn, sponsored
by our own paymaster).

[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat Ignition](https://img.shields.io/badge/Hardhat-Ignition-fff04d?logo=ethereum&logoColor=black)](https://hardhat.org/ignition)
[![ERC-4337 v0.7](https://img.shields.io/badge/ERC--4337-v0.7-6b7280)](https://eips.ethereum.org/EIPS/eip-4337)
[![ERC-4626](https://img.shields.io/badge/ERC--4626-vault-6b7280)](https://eips.ethereum.org/EIPS/eip-4626)
[![pnpm 9](https://img.shields.io/badge/pnpm-9.x-f69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20.10-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![Turborepo](https://img.shields.io/badge/monorepo-turborepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build)
[![License MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[Features](#features) · [Architecture](#architecture) · [Quick start](#quick-start) · [Env vars](#environment-variables) · [Deploy](#deploying-the-contracts) · [Testing the flow](#testing-the-full-flow)

</div>

---

## What this demonstrates

A single project that exercises the full senior-Web3 stack — on-chain,
off-chain, and UI — with no scaffolding shortcuts:

- ERC-4626 vaults with auto strategy routing on every deposit/withdraw
- ERC-4337 v0.7 smart accounts with **WebAuthn P-256** signatures verified
  via the **RIP-7212 precompile** (≈ 3.5k gas)
- A backend-signed paymaster with sliding-window spend caps
- Pimlico bundler + `permissionless.js` UserOp construction
- The Graph subgraph with a custom `SharePriceSnapshot` entity for a
  share-price-derived APY
- Next.js 14 App Router · Tailwind · shadcn/ui · wagmi v2 · viem · Recharts
- Turborepo + pnpm workspaces + Prisma + Postgres

## Features

- **Two-lane connect.**
  *Use my wallet* → Reown AppKit modal (MetaMask, Rainbow, Coinbase,
  WalletConnect) — wallets only, no email, no socials.
  *Create smart account* → WebAuthn passkey → counterfactual ERC-4337
  account, deployed atomically on the first deposit.
- **Gasless deposits.** On-chain `Paymaster` with a backend verifier,
  per-sender and global daily caps, and an allow-list of target
  contracts.
- **Atomic first deposit.** `executeBatch(approve + deposit)` bundled into
  one UserOperation, one Face ID prompt, account deployed on the same op.
- **Auto-compounding vault.** Every `deposit` / `withdraw` supplies/recalls
  from the `MockAave` strategy automatically; `totalAssets()` reflects the
  full position.
- **Real-time dashboard.** TVL chart (per-event), share-price-derived APY,
- **Multi-chain ready.** Sepolia (primary) and Base Sepolia (secondary).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                 apps/web  (Next.js 14 · App Router)              │
│  wagmi v2 · viem · Reown AppKit · permissionless · Recharts      │
│  WebAuthn · IndexedDB · Framer Motion · R3F                      │
└────┬──────────────┬────────────────────┬────────────────────────┘
     │ REST + WS    │ GraphQL            │ RPC (viem)
     ▼              ▼                    ▼
┌──────────────┐  ┌────────────────┐  ┌────────────────────────┐
│  apps/api    │  │ apps/subgraph  │  │ Sepolia / Base Sepolia │
│ Prisma + PG  │  │ schema.graphql │  │                        │
│ WS server    │  │ mappings.ts    │  │  + EntryPoint v0.7     │
└──────┬───────┘          │indexes    └──────────▲─────────────┘
       │   ┌──────────────────────────────────────────────────┐
       │   │ packages/contracts  (Hardhat + Ignition)         │
       └──▶│ YieldVault · MockAave · MockUSDC · Paymaster     │
           │ YieldPilotAccount · YieldPilotAccountFactory     │
           └──────────────────────────────────────────────────┘
```

Workspace layout:

```
apps/
  api/        → Express + TypeScript backend (Fly / Railway / Render)
  subgraph/   → The Graph subgraph (Subgraph Studio)

packages/
  contracts/      → Solidity + Hardhat + Ignition
  contracts-abi/  → generated ABIs consumed by web + api
  database/       → Prisma schema + client
  shared/         → env + chain + type utilities
  tsconfig/       → shared tsconfig bases

deployments/           → Ignition deploy snapshots
```

## Tech stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 14 · TypeScript (strict) · Tailwind · shadcn/ui · wagmi v2 · viem · Reown AppKit · `permissionless.js` · `@simplewebauthn/browser` · `@noble/curves` · Recharts · Framer Motion · GSAP · React Three Fiber |
| **Contracts** | Solidity 0.8.24 (EVM Cancun) · Hardhat · Hardhat Ignition · OpenZeppelin · `@account-abstraction/contracts` v0.7 · RIP-7212 P-256 precompile |
| **Indexing** | The Graph (Subgraph Studio) · AssemblyScript mappings · `SharePriceSnapshot` entity for APY derivation |
| **Infra** | Turborepo · pnpm workspaces · Docker (Postgres) |

## Prerequisites

- **Node** ≥ 20.10
- **pnpm** ≥ 9 (repo pins `pnpm@9.12.0`)
- **Docker** (for local Postgres)
- **Funded deployer wallet** on Sepolia — you need a tiny amount of ETH for
  `hardhat ignition deploy` and for the EntryPoint stake + deposit used by
  the paymaster (~0.2 ETH total is plenty for testnet)
- Free accounts at:
  - [cloud.reown.com](https://cloud.reown.com) — AppKit project ID
  - [dashboard.pimlico.io](https://dashboard.pimlico.io) — bundler API key
  - [thegraph.com/studio](https://thegraph.com/studio) — subgraph slug + deploy key
  - [etherscan.io/apis](https://etherscan.io/apis) — verification key

## Quick start

```bash
# 1. Clone + install
git clone <this-repo> yield-pilot
cd yield-pilot
pnpm install

# 2. Local Postgres
docker compose -f docker/docker-compose.yml up -d db

# 3. Generate the Prisma client + run migrations
pnpm -F @yield-pilot/database exec prisma generate
pnpm -F @yield-pilot/database exec prisma migrate deploy

# 4. Seed env files (fill in the keys from the table below)
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local

# 5. Compile contracts + refresh shared ABIs
pnpm compile
pnpm -F @yield-pilot/contracts-abi build

# 6. Run web + api + subgraph dev servers (turbo parallel)
pnpm dev
#   web      → http://localhost:3000
#   api      → http://localhost:4000   (health: /healthz)
#   ws feed  → ws://localhost:4000/ws/events
```

### Verify the install

```bash
pnpm lint          # ESLint across every workspace — should be 0 errors
pnpm typecheck     # tsc --noEmit across every workspace
pnpm build         # production build for web / api / contracts
pnpm -F @yield-pilot/contracts test    # Hardhat + chai unit tests
```

## Environment variables

Copy `.env.example` → `.env.local`, then fill in the keys. The per-app
`.env.example` files are narrower subsets of the root.

### Required to run

| Key | Used by | What it is |
|---|---|---|
| `RPC_URL_BASE_SEPOLIA` | contracts, api | Base Sepolia RPC |
| `DEPLOYER_PRIVATE_KEY` | contracts | Signer for `ignition deploy` (server-only) |
| `ETHERSCAN_API_KEY` | contracts | Used by `hardhat verify` / `--verify` flag |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | web | Reown AppKit wallet modal |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | web | Pimlico bundler (testnet tier is free) |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | api | Backend key that signs sponsorship approvals. **Must match** on-chain `Paymaster.verifier()` |
| `DATABASE_URL` / `DIRECT_URL` | api | Postgres connection (Prisma). Default: `postgresql://dev:dev@localhost:5432/yield-pilot` |

### Filled after contract deployment

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA` | Deployed `YieldVault` |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS_SEPOLIA` | Deployed `MockUSDC` |
| `NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA` | Deployed `MockAave` strategy |
| `NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS_SEPOLIA` | Deployed `Paymaster` |
| `NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS_SEPOLIA` | Deployed `YieldPilotAccountFactory` |
| `VAULT_ADDRESS_SEPOLIA` · `PAYMASTER_CONTRACT_ADDRESS_SEPOLIA` · `ACCOUNT_FACTORY_ADDRESS_SEPOLIA` | Backend-only copies (no `NEXT_PUBLIC_` prefix) |


| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA` | Subgraph Studio query endpoint |
| `STUDIO_SLUG` / `STUDIO_DEPLOY_KEY` | `graph deploy` credentials |

### Paymaster policy (safe defaults)

| Key | Default | Purpose |
|---|---|---|
| `PAYMASTER_DAILY_GLOBAL_CAP_WEI` | `50000000000000000` (0.05 ETH) | Sliding-window daily cap across all senders |
| `PAYMASTER_DAILY_PER_SENDER_CAP_WEI` | `10000000000000000` (0.01 ETH) | Sliding-window per-sender daily cap |

> **Verifier invariant.** The address derived from
> `PAYMASTER_SIGNER_PRIVATE_KEY` **must equal** the on-chain
> `Paymaster.verifier()`. The sponsor route reads the on-chain verifier on
> startup and refuses to sign if they diverge. Use
> `packages/contracts/scripts/fix-verifier.ts` to realign after a redeploy.

## Deploying the contracts

```bash
# Deploy everything (Vault, USDC, Aave, Paymaster, Account impl + Factory)
pnpm -F @yield-pilot/contracts deploy:sepolia

# Post-deploy wiring: paymaster verifier, allowed targets, budgets,
# EntryPoint stake + deposit — sets everything the paymaster needs.
pnpm -F @yield-pilot/contracts exec tsx scripts/post-deploy.ts

# Paste the emitted addresses into:
#   .env.local (root)
#   apps/web/.env.local
#   apps/api/.env.local
```

Helper scripts in `packages/contracts/scripts/`:

| Script | Purpose |
|---|---|
| `post-deploy.ts` | Wire paymaster → vault, stake + deposit at EntryPoint |
| `post-deploy-extra.ts` | Factory allow-list + batch paymaster refresh |
| `redeploy-paymaster.ts` | Redeploy + rewire paymaster (keeps vault) |
| `redeploy-vault.ts` | Redeploy vault with the existing paymaster |
| `fix-verifier.ts` | Realign on-chain paymaster verifier with backend signer |
| `accrue-demo-yield.ts` | Bump MockAave APY to show live yield on the dashboard |
| `mint-usdc.ts` | Mint MockUSDC to any address (manual testing) |

## Deploying the subgraph

```bash
pnpm -F @yield-pilot/contracts compile     # refresh ABIs first
pnpm -F @yield-pilot/subgraph codegen
pnpm -F @yield-pilot/subgraph build
pnpm -F @yield-pilot/subgraph deploy
```

Whenever the vault is redeployed, update `apps/subgraph/subgraph.yaml` with
the new `YieldVault` address and start block, then redeploy the subgraph.

## Testing the full flow

1. **Path A — existing wallet** (MetaMask on Sepolia).
   Header *Connect* → *Use my wallet* → Reown modal → approve USDC →
   deposit. Triggers a standard MetaMask tx. Badge reads `EOA`.
2. **Path B — passkey** (new user).
   Header *Connect* → *Create smart account* → passkey register (Face ID /
   Touch ID / Windows Hello) → counterfactual address appears with a
   `Passkey` badge. Mint MockUSDC from the **Faucet** tab, then deposit →
   **one** biometric prompt, gasless, account deployed on the same op.
3. **Watch yield accrue.** On the Faucet tab use *Accrue demo yield* to
   bump MockAave APY — TVL + APY charts update within 30 s and the
   activity feed streams over WebSocket.

## Scripts reference

Root scripts fan out to all workspaces via Turbo:

| Command | What it does |
|---|---|
| `pnpm dev` | Run `web`, `api`, `subgraph` dev servers in parallel |
| `pnpm build` | Production build for every workspace |
| `pnpm test` | Run every test suite (contracts suite is the fullest) |
| `pnpm lint` | Lint all workspaces (next, eslint, solhint) |
| `pnpm typecheck` | `tsc --noEmit` across every TS workspace |
| `pnpm compile` | Hardhat compile |
| `pnpm format` / `pnpm format:check` | Prettier across the tree |
| `pnpm clean` | Remove build output + `.turbo` everywhere |

Scope to a single workspace with `pnpm -F @yield-pilot/<name> <script>`.
Example:

```bash
pnpm -F @yield-pilot/contracts test
pnpm -F @yield-pilot/web typecheck
pnpm -F @yield-pilot/api dev
```

## Project highlights

```
apps/web/
  app/                       # Next.js 14 App Router pages
  components/wallet/         # ConnectChooser · PasskeyRegister · JoinDevice
  hooks/useDeposit.ts        # EOA vs passkey branching
  lib/userop.ts              # UserOp build + sponsor + submit (permissionless)
  lib/passkey.ts             # WebAuthn helpers + IndexedDB

apps/api/
  src/routes/paymaster.ts    # POST /api/paymaster/sponsor
  src/services/              # paymaster-signer + paymaster-policy
  src/ws.ts                  # WS server for realtime events

apps/subgraph/
  schema.graphql             # VaultEvent + SharePriceSnapshot entities
  src/yield-vault.ts         # AssemblyScript mappings

packages/contracts/contracts/core/
  YieldVault.sol                   # ERC-4626 with auto strategy routing
  YieldPilotAccount.sol            # ERC-4337 P-256 account (RIP-7212)
  YieldPilotAccountFactory.sol     # CREATE2 factory (ERC-1967 proxy)
  Paymaster.sol                    # Verifier-signed BasePaymaster
```

## Security notes

- `ReentrancyGuard` on every state-changing vault entry point.
- **Paymaster:** ECDSA-signed approvals only; per-sender + global daily
  caps; allow-listed targets (vault + USDC for `executeBatch`). Budget is
  enforced both at sponsorship time (off-chain) and in `_postOp`
  (on-chain).
- **`YieldPilotAccount`:** only callable by the canonical EntryPoint v0.7;
  P-256 signatures verified via the RIP-7212 precompile at
  `0x0000…0100` (~3.5k gas).
- **Virtual-shares inflation defense:** `_decimalsOffset = 6` on
  `YieldVault` neutralises the first-depositor attack.
- No secrets in the repo — `.env` is gitignored; `.env.example` files
  document every required key. A staged commit referencing
  `DEPLOYER_PRIVATE_KEY` or any private key will be rejected by pattern
  checks in CI.

## Troubleshooting

- **AA34 "paymaster signature error"** → the on-chain `Paymaster.verifier()`
  doesn't match the address derived from `PAYMASTER_SIGNER_PRIVATE_KEY`.
  Run `scripts/fix-verifier.ts` or sync the env values across files.
- **AA25 "stale nonce"** → handled automatically by a single retry in
  `apps/web/lib/userop.ts::buildAndSendUserOp`.
- **Paymaster rejects your UserOp target** → hit
  `Paymaster.setTarget(<addr>, true)` on-chain; the allow-list is owner-gated.
- **Charts stay empty after deposits** → the subgraph lags by 1–2 blocks on
  testnets; `pnpm -F @yield-pilot/subgraph deploy` after a vault redeploy.

## License

[MIT](./LICENSE)
