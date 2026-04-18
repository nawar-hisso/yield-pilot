# YieldPilot


Scaffolded from a
user-provided PRD. See `docs/PRD.md` for the canonical spec.

## Architecture

```
apps/web       → Next.js 14 frontend (Vercel)
apps/api       → Express + TypeScript backend (Fly / Railway / Render)
apps/subgraph  → The Graph subgraph (Subgraph Studio)
packages/contracts, contracts-abi, database, shared, tsconfig
```

Deploys on **Sepolia** (primary) + **Base Sepolia** (secondary).

## Getting started

```bash
pnpm install
cp .env.example .env.local      # fill secrets
docker compose up -d db         # local Postgres
pnpm compile                    # build contracts
pnpm dev                        # turbo runs web + api in parallel
```


## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run all dev servers (turbo parallel) |
| `pnpm build` | Production build for all packages |
| `pnpm test` | Run every test suite |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm compile` | Hardhat compile (packages/contracts) |
| `pnpm -F @yield-pilot/<name> <script>` | Target one workspace |

## Next step

