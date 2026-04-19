# YieldPilot

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-Ignition-fff04d?logo=ethereum&logoColor=black)
![pnpm](https://img.shields.io/badge/pnpm-9.x-f69220?logo=pnpm&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D20.10-43853d?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

**YieldPilot** is a DeFi yield dashboard on Sepolia. Deposit USDC into an
ERC-4626 vault, earn simulated yield, and pay **zero gas** — either by
connecting an existing wallet (Reown AppKit) or by creating a self-custodial
**passkey** smart account (ERC-4337 + P-256 / Face ID / Touch ID) sponsored by
our own paymaster.

> Portfolio project demonstrating end-to-end Web3 engineering: ERC-4626
> vaults, ERC-4337 passkey accounts, RIP-7212 P-256 verification, Pimlico
> WebSocket realtime, Prisma/Postgres, and a production-grade Next.js 14
> dashboard.

---

## Features

- **Two-lane connect**
  - *"Use my wallet"* → Reown AppKit modal (MetaMask, Rainbow, Coinbase,
    WalletConnect), wallets-only — no email, no socials.
  - *"Create smart account"* → WebAuthn passkey registration → counterfactual
    ERC-4337 account, deployed atomically on the first deposit.
- **Gasless deposits** via an on-chain `Paymaster` with a backend verifier and
  sliding-window daily caps (per-sender + global).
- **Atomic first deposit** — `executeBatch(approve + deposit)` bundled into one
  UserOperation, one Face ID prompt, account deployed on the same op.
- **ERC-4626 vault with auto-strategy** — every `deposit` / `withdraw`
  automatically supplies/recalls from a `MockAave` strategy; TVL reflects the
  full position including accrued interest.
- **Real-time dashboard** — TVL chart (per-event), share-price-derived APY,
  a WebSocket stream.
- **Multi-chain ready** — Sepolia (primary) and Base Sepolia (secondary).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 14, App Router)                          │
│    wagmi v2 · viem · Reown AppKit · permissionless · Recharts│
└────────┬──────────────┬────────────────────┬────────────────┘
         │ REST/WS      │ GraphQL            │ RPC (viem)
         ▼              ▼                    ▼
┌──────────────┐  ┌────────────────┐  ┌───────────────────────┐
│  apps/api    │  │ apps/subgraph  │  │ Sepolia / Base Sepolia│
│  Prisma + PG │  │ schema.graphql │  │                       │
│  WS server   │  │ mappings.ts    │  │   + EntryPoint v0.7   │
└──────┬───────┘         │ indexes    └───────────▲───────────┘
       │    ┌──────────────────────────────────────────────┐
       │    │ packages/contracts  (Hardhat + Ignition)     │
       └───▶│ YieldVault · MockAave · MockUSDC             │
            │ Paymaster · YieldPilotAccount · Factory      │
            └──────────────────────────────────────────────┘
```

Workspace layout:

```
apps/api        → Express + TypeScript backend (Fly / Railway / Render)
apps/subgraph   → The Graph subgraph (Subgraph Studio)
packages/
  contracts     → Solidity + Hardhat + Ignition
  contracts-abi → generated ABIs consumed by web + api
  database      → Prisma schema + client
  shared        → env + chain + type utilities
  tsconfig      → shared tsconfig bases
```

## Tech stack

**Frontend** — Next.js 14 · TypeScript strict · Tailwind · shadcn/ui · wagmi v2 · viem · Reown AppKit · `permissionless.js` · `@simplewebauthn/browser` · `@noble/curves` · Recharts · Framer Motion + GSAP + React Three Fiber


**Contracts** — Solidity 0.8.24 · Hardhat · Hardhat Ignition · OpenZeppelin · `@account-abstraction/contracts` (EntryPoint v0.7) · RIP-7212 P-256 precompile

**Indexing** — The Graph (Subgraph Studio) · AssemblyScript mappings · `SharePriceSnapshot` entity for APY derivation

## Prerequisites

- Node 20.10+
- pnpm 9+
- Docker (for local Postgres)
- A funded deployer wallet on Sepolia (ETH for gas + deploys)
- Free accounts at:
  - [cloud.reown.com](https://cloud.reown.com) — AppKit project ID
  - [dashboard.pimlico.io](https://dashboard.pimlico.io) — bundler API key
  - [thegraph.com/studio](https://thegraph.com/studio) — subgraph slug + deploy key
  - [etherscan.io/apis](https://etherscan.io/apis) — verification

## Quick start

```bash
git clone <this-repo> yield-pilot
cd yield-pilot
pnpm install

# 1. Local Postgres
docker compose -f docker/docker-compose.yml up -d db

# 2. Prisma client (regenerate any time schema changes)
pnpm -F @yield-pilot/database exec prisma generate
pnpm -F @yield-pilot/database exec prisma migrate deploy

# 3. Environment
cp .env.example .env.local
# Fill in the keys below, then copy per-app overrides as needed:
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local

# 4. Compile contracts + build ABIs
pnpm compile
pnpm -F @yield-pilot/contracts-abi build

# 5. Run web + api in parallel (turbo)
pnpm dev
#   web → http://localhost:3000
#   api → http://localhost:4000  (health: /healthz)
```

## Environment variables

Required for local dev. Full list with comments lives in `.env.example`.

| Key | Purpose |
|---|---|
| `RPC_URL_BASE_SEPOLIA` | Base Sepolia RPC |
| `DEPLOYER_PRIVATE_KEY` | Signer for `ignition deploy` (server-only) |
| `ETHERSCAN_API_KEY` | For `hardhat verify` |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown AppKit wallet modal |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Pimlico bundler (testnet tier is free) |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Backend key that signs sponsorship approvals (must match on-chain `Paymaster.verifier()`) |
| `DATABASE_URL` / `DIRECT_URL` | Postgres connection (Prisma) |
| `NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA` | Query endpoint from Subgraph Studio |
| `STUDIO_SLUG` / `STUDIO_DEPLOY_KEY` | Subgraph publish credentials |
| `NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA` | Deployed `YieldVault` address |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS_SEPOLIA` | Deployed `MockUSDC` address |
| `NEXT_PUBLIC_MOCK_AAVE_ADDRESS_SEPOLIA` | Deployed `MockAave` strategy address |
| `NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS_SEPOLIA` | Deployed `Paymaster` address |
| `NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS_SEPOLIA` | Deployed `YieldPilotAccountFactory` address |

The `apps/api` process reads server-only copies (no `NEXT_PUBLIC_` prefix) —
see `apps/api/.env.example`.

> **Paymaster verifier invariant:** `PAYMASTER_SIGNER_PRIVATE_KEY` → address
> **must equal** the on-chain `Paymaster.verifier()`. The sponsor route
> verifies this on startup and refuses to sign if they diverge. Use
> `packages/contracts/scripts/fix-verifier.ts` to realign.

## Deploying the contracts

```bash
# Deploy everything (Vault, USDC, Aave, Paymaster, Account impl + Factory)
pnpm -F @yield-pilot/contracts deploy:sepolia

# Post-deploy wiring (paymaster verifier + target + budget + EntryPoint deposit)
pnpm -F @yield-pilot/contracts exec tsx scripts/post-deploy.ts

# Copy the emitted addresses into .env.local / apps/web/.env.local / apps/api/.env.local
```

Helper scripts in `packages/contracts/scripts/`:

| Script | Purpose |
|---|---|
| `post-deploy.ts` | Wire paymaster → vault, stake + deposit at EntryPoint |
| `redeploy-paymaster.ts` | Redeploy + rewire paymaster (keeps vault) |
| `redeploy-vault.ts` | Redeploy the vault with the existing paymaster |
| `fix-verifier.ts` | Realign on-chain paymaster verifier with backend signer |
| `accrue-demo-yield.ts` | Bump MockAave APY to show live yield on the dashboard |
| `mint-usdc.ts` | Mint MockUSDC to any address (for manual testing) |

## Deploying the subgraph

```bash
pnpm -F @yield-pilot/subgraph codegen
pnpm -F @yield-pilot/subgraph build
pnpm -F @yield-pilot/subgraph deploy
```

Update `subgraph.yaml` with the new `YieldVault` address + start block whenever
the vault is redeployed.

## Scripts

Root scripts fan out to all workspaces via Turbo:

| Command | What it does |
|---|---|
| `pnpm dev` | Run `web`, `api`, `subgraph` dev servers in parallel |
| `pnpm build` | Production build for every workspace |
| `pnpm test` | Run every test suite (`@yield-pilot/contracts` has the fullest one) |
| `pnpm lint` | Lint all workspaces (next, eslint, solhint) |
| `pnpm typecheck` | `tsc --noEmit` across all TS workspaces |
| `pnpm compile` | Hardhat compile |
| `pnpm format` / `pnpm format:check` | Prettier across the tree |

Target a single workspace: `pnpm -F @yield-pilot/<name> <script>` — e.g.
`pnpm -F @yield-pilot/contracts test`.

## Testing the full flow

1. **Path A — existing wallet** (MetaMask on Sepolia):
   Connect → *Use my wallet* → Reown modal → approve USDC → deposit →
   standard MetaMask tx.
2. **Path B — passkey** (new user):
   Connect → *Create smart account* → passkey register (Face ID / Touch ID) →
   counterfactual address shown with a `Passkey` badge → mint MockUSDC from
   the Faucet tab → deposit → **one** biometric prompt, gasless.
3. **See yield accrue**: on the Faucet tab, use *Accrue demo yield* to bump
   MockAave APY. TVL + APY charts update within 30s; the activity feed streams
   events over WebSocket.

## Project structure highlights

```
apps/
  web/app/                     # Next.js 14 App Router pages
  web/components/wallet/       # ConnectChooser, PasskeyRegister, JoinDevice
  web/hooks/useDeposit.ts      # EOA vs passkey branching
  web/lib/userop.ts            # UserOp build + sponsor + submit
  web/lib/passkey.ts           # WebAuthn helpers + IndexedDB

  api/src/routes/paymaster.ts  # POST /api/paymaster/sponsor
  api/src/services/            # paymaster-signer + paymaster-policy
  api/src/ws.ts                # WS server for realtime events

  subgraph/schema.graphql      # Vault events + SharePriceSnapshot
  subgraph/src/yield-vault.ts  # AssemblyScript mappings

packages/contracts/contracts/core/
  YieldVault.sol               # ERC-4626 with auto strategy routing
  YieldPilotAccount.sol        # ERC-4337 P-256 account (RIP-7212)
  YieldPilotAccountFactory.sol # CREATE2 factory (ERC-1967 proxy)
  Paymaster.sol                # Verifier-signed BasePaymaster
```

## Security notes

- `ReentrancyGuard` on every state-changing vault entry point.
- Paymaster: ECDSA-signed approvals only, per-sender + global daily caps,
  allow-listed targets (vault + USDC for `executeBatch`).
- `YieldPilotAccount`: only callable by the canonical EntryPoint v0.7; P-256
  signatures verified via RIP-7212 precompile (~3.5k gas).
- Virtual-shares inflation defense: `_decimalsOffset = 6` on `YieldVault`.
- No secrets in the repo — every `.env` is gitignored, `.env.example`
  documents every required key.

## License

MIT
