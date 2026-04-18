# @yield-pilot/api

Standalone Express + TypeScript backend.

- `GET/PUT /api/user/preferences` — off-chain user settings (Prisma)
- `WS /ws/events` — real-time fan-out to the frontend

## Run

```bash
pnpm -F @yield-pilot/api dev      # tsx watch
pnpm -F @yield-pilot/api build    # tsc → dist/
pnpm -F @yield-pilot/api start    # node dist/index.js
```

Requires Postgres running (`docker compose up -d db` from repo root).
Env: copy `.env.example` to `.env.local`.

## Deploy

