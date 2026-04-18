# YieldPilot — Architecture

Canonical design document for the YieldPilot monorepo. Derived from `docs/PRD.md` (verbatim intent) and `` (locked choices). All builders follow this during ``.

---

## 1. System Overview


```
┌────────────────────────────────────────────────────────────────────────┐
│                          apps/web  (Next.js 14)                         │
│  wagmi v2 + viem · Web3Auth provider · Tailwind (custom-brand)          │
│  Recharts · SWR · graphql-request · WebSocket client                    │
└───────┬──────────────────┬───────────────────────┬─────────────────────┘
        │ REST/WS          │ GraphQL               │ RPC (viem)
        ▼                  ▼                       ▼
┌───────────────┐  ┌─────────────────┐   ┌─────────────────────────────┐
│  apps/api     │  │ apps/subgraph   │   │ Sepolia / Base Sepolia RPC  │
│  Prisma (PG)  │  │ schema.graphql  │   │                             │
│  ws server    │  │ mappings.ts     │   │                             │
└───────┬───────┘           │indexes     │                             │
        │           ┌──────────────────────────────────────────────┐   │
        │           │  packages/contracts  (Hardhat + Ignition)    │   │
        └──────────▶│  YieldVault · MockAave · Paymaster           │◀──┘
                    └──────────────────────────────────────────────┘
```

---

## 2. Monorepo Layout

Every workspace package is `@yield-pilot/<name>`. `apps/*` are private, `packages/*` may be published internally.

**Apps**
- `apps/web` — Next.js 14 App Router frontend. Deploys to Vercel. Imports ABIs from `@yield-pilot/contracts-abi`, shared types from `@yield-pilot/shared`. No API routes — all backend traffic goes to `NEXT_PUBLIC_API_URL`.
- `apps/subgraph` — The Graph subgraph (`schema.graphql`, `subgraph.yaml`, `src/mappings.ts`). One build per target chain; deployed to Subgraph Studio.

**Packages**
- `packages/contracts` — Hardhat project. Solidity 0.8.24, OpenZeppelin v5, Hardhat Ignition modules in `ignition/modules/`. Single bytecode targets both chains.
- `packages/contracts-abi` — Generated ABI JSON + TypeChain types. Built by `scripts/extract-abis.mjs` after `hardhat compile`. Pure output artifact — never hand-edited.
- `packages/database` — Prisma schema (`prisma/schema.prisma`) + generated client. Consumed only by `apps/api`.
- `packages/shared` — Cross-app TypeScript types (subgraph responses, WS event shapes, vault DTOs) and zod env schemas used by both apps.
- `packages/tsconfig` — Shared presets: `base.json`, `nextjs.json`, `node.json`. Every `tsconfig.json` in the repo extends one of these.

**Non-workspace**
- `.github/workflows/` — `ci.yml` (lint/test/build on PR), `deploy.yml` (main-branch deploys).

---

## 3. Data Flows

### (a) Standard deposit (EOA path)
1. User clicks Deposit on `apps/web/app/vault/page.tsx`; form validates amount via zod from `@yield-pilot/shared`.
2. `hooks/useVault.ts` calls `writeContract` (wagmi) → `MockUSDC.approve(vault, amount)`.
3. On approval receipt, second `writeContract` → `YieldVault.deposit(assets, receiver)`.
4. viem returns tx hash; UI shows optimistic pending state; SWR key `vault/position` is revalidated.
5. `Deposit` event is emitted on-chain → indexed by subgraph → surfaced on Dashboard via GraphQL poll + live via WS (flow d).

### (b) Gasless deposit (ERC-4337 path)
1. User toggles "Gasless deposit"; `hooks/useGaslessDeposit.ts` builds a `UserOperation` for `YieldVault.deposit` via the smart-account SDK (permissionless.js on top of viem).
3. `Paymaster.validatePaymasterUserOp` verifies spending caps from `Paymaster.sol` before signing.
4. Signed UserOp is submitted to the bundler → `EntryPoint v0.7` at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`.
5. `EntryPoint` calls `YieldVault.deposit` on the smart account's behalf; gas is reimbursed from the Paymaster's deposit.
6. Same downstream indexing + WS push as flow (a).

### (c) Safe-delegated strategy execution
3. Module proxies to `Safe.execTransactionFromModule(target, 0, data, Call)`.

### (d) Real-time event fan-out
4. Event is normalized into a `@yield-pilot/shared` DTO, persisted (optional) and published to an in-process event bus.
5. `apps/api/src/ws/server.ts` broadcasts to subscribed clients (keyed by wallet + chainId).
6. `apps/web/hooks/useLiveEvents.ts` receives the message, invalidates relevant SWR keys (`vault/position`, `vault/history`), and prepends to the activity feed.

---

## 4. Cross-Workspace Contracts

| Package | Consumed by | Exports |
|---|---|---|
| `@yield-pilot/contracts` | build-time only | Solidity sources + Ignition modules |
| `@yield-pilot/contracts-abi` | `apps/web`, `apps/api` | ABI JSON + TypeChain types |
| `@yield-pilot/database` | `apps/api` | Prisma client singleton (`db.ts`) + generated types |
| `@yield-pilot/shared` | `apps/web`, `apps/api`, `apps/subgraph` (types only) | zod schemas, event DTOs, env validators |
| `@yield-pilot/tsconfig` | every ts package | `base.json`, `nextjs.json`, `node.json` |

**ABI propagation path:** `pnpm -F @yield-pilot/contracts compile` (Hardhat) → `node scripts/extract-abis.mjs` reads `packages/contracts/artifacts/**/*.json` → writes stripped ABIs to `packages/contracts-abi/src/abis/*.json` + TypeChain d.ts to `packages/contracts-abi/src/types/` → `pnpm -F @yield-pilot/contracts-abi build` emits `dist/`. Downstream apps import from `@yield-pilot/contracts-abi` (e.g. `import { YieldVaultAbi } from '@yield-pilot/contracts-abi'`). Turborepo's `build` DAG ensures ABIs are regenerated before `apps/web` and `apps/api` build.

---

## 5. Chain Strategy

- **Single bytecode, multi-deploy.** `packages/contracts/ignition/modules/Deploy.ts` is parameterized by `chainId`; running `pnpm -F @yield-pilot/contracts deploy:sepolia` and `deploy:base-sepolia` produces different addresses for identical bytecode.
- **Frontend chain switching.** `apps/web/src/config/wagmi.ts` registers both chains in `createConfig({ chains: [sepolia, baseSepolia] })`. `apps/web/src/lib/contracts.ts` maps `chainId → { YieldVault, Paymaster, MockUSDC, MockAave }` by reading `NEXT_PUBLIC_<CONTRACT>_ADDRESS` (Sepolia) and `NEXT_PUBLIC_<CONTRACT>_ADDRESS_BASE_SEPOLIA`.
- **Chainlink feeds.** Feed addresses vary per chain; resolved through the same address map (e.g. `NEXT_PUBLIC_CHAINLINK_USDC_USD_FEED` + `_BASE_SEPOLIA` suffix).
- **Subgraph per chain.** One subgraph deployment per chain on Subgraph Studio. `apps/subgraph/networks.json` holds per-chain start-blocks + contract addresses. `apps/web/src/lib/subgraph.ts` picks the endpoint by `chainId`.

---

## 6. Environment & Secrets Boundary

**Root `.env`** — shared dev defaults, never secrets. `docker-compose` reads it.

**`apps/web/.env.local`** — public only, all `NEXT_PUBLIC_*`:
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_DEFAULT_CHAIN_ID`
- `NEXT_PUBLIC_RPC_SEPOLIA`, `NEXT_PUBLIC_RPC_BASE_SEPOLIA`
- `NEXT_PUBLIC_<CONTRACT>_ADDRESS[_BASE_SEPOLIA]`
- `NEXT_PUBLIC_SUBGRAPH_URL[_BASE_SEPOLIA]`
- `NEXT_PUBLIC_BUNDLER_URL`, `NEXT_PUBLIC_PAYMASTER_URL`

**`apps/api/.env`** — server-only, no `NEXT_PUBLIC_*`:
- `DATABASE_URL` (Postgres)
- `CORS_ALLOWED_ORIGINS`
- `WS_PORT`, `PORT`

**`packages/contracts/.env`** — deploy-time only:
- `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY`, `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`

Each app validates its env via a zod schema imported from `@yield-pilot/shared/env`. `.gitignore` excludes every `.env*` except `.env.example`.

---

## 7. Deployment Targets

| Target | Artifact | How |
|---|---|---|
| Vercel | `apps/web` | `vercel --prod`, root dir `apps/web`, build cmd `pnpm -F @yield-pilot/web build`; env vars injected via Vercel dashboard. |
| Subgraph Studio | `apps/subgraph` | `graph deploy --studio yield-pilot-sepolia` / `yield-pilot-base-sepolia`. Versioned per release. |
| Sepolia + Base Sepolia | `packages/contracts` | Hardhat Ignition: `pnpm deploy:sepolia`, `pnpm deploy:base-sepolia`; Etherscan-family verification via `hardhat verify`. |
| GitHub Actions | whole repo | `.github/workflows/ci.yml` on PR; `deploy.yml` on `main` fans out to Vercel/Fly/Studio via action tokens. |


---

## 8. Turborepo Pipeline

`turbo.json` (effective DAG):

- `compile` — only in `packages/contracts`. No deps. Outputs `artifacts/`, `cache/`, `typechain-types/`.
- `build`:
  - `@yield-pilot/contracts-abi#build` depends on `@yield-pilot/contracts#compile`
  - `@yield-pilot/database#build` (prisma generate) has no deps
  - `@yield-pilot/shared#build` has no deps
  - `@yield-pilot/web#build` depends on `@yield-pilot/contracts-abi#build`, `@yield-pilot/shared#build`
  - `@yield-pilot/api#build` depends on `@yield-pilot/contracts-abi#build`, `@yield-pilot/shared#build`, `@yield-pilot/database#build`
  - `@yield-pilot/subgraph#build` depends on `@yield-pilot/contracts#compile` (for ABIs)
- `test` — depends on `^build` for app packages; standalone in `packages/contracts` (Hardhat runs off sources).
- `lint` / `typecheck` — no deps, runs in every package.
- `dev` — `persistent: true, cache: false`; `pnpm dev` fans out to web + api + (optional) local graph-node.

Cache keys respect `inputs` globs; artifacts (`artifacts/**`, `dist/**`, `.next/**`) are declared as `outputs`.

---

## 9. Risks & Open Questions

1. **Wallet provider override** — User selected Web3Auth; PRD wrote Reown/WalletConnect. If community deck/demo requires WalletConnect, we'd need to swap `Web3Provider.tsx` . Decision is locked for v1.
2. **Chainlink feeds on testnet** — Sepolia has decent feed coverage; Base Sepolia is sparser. Need to confirm USDC/USD feed availability on both chains; fall back to a mock `PriceConsumer` if a feed is missing.
4. **Graph tier limitations** — Subgraph Studio free tier imposes query-rate caps; for a portfolio demo this is fine, but any live-traffic scenario would need The Graph Network (hosted service) or a self-hosted Graph Node (already present in `docker-compose.yml`).
