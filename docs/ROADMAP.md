# YieldPilot — post-deploy roadmap

Work queued AFTER the first Sepolia + Base Sepolia deploy. Everything here is
visible in the UI today but either mocked or stubbed; listed in priority order.

## P1 — polish the deployed build (~90 min total)

### 1. Wire Dashboard charts to the live subgraph (~30 min)

`TvlChart` + `ApyChart` currently use `mulberry32`-seeded mock series. Once
`graph deploy` runs, swap the data source to GraphQL queries.

- Replace `mockSeries(30)` in `components/dashboard/TvlChart.tsx` with a
  `useSWR` call to the subgraph `vaultDailyStats` entity.
- Same for `ApyChart` — derive APY from consecutive `sharePrice` snapshots.
- Keep `mulberry32` as a fallback if the subgraph URL isn't set yet.

### 2. `useRevokeKey` hook + revoke wiring (~20 min)

`PairedDevicesCard` has the button; the hook just throws. Mirror
`useAddAuthorizedKey` — build the `execute(this, 0, revokeKey(credId))` UserOp,
sign with the primary passkey, submit via the Pimlico bundler. Wire the
button to the hook + toast on success, SWR refetch.


Infrastructure is wired end-to-end; just config:

   deployed `apps/api` URL + vault address.
3. Restart apps/api. DashboardOverview's "Live activity" card will start
   populating from the WS relay.

### 4. `next/image` optimisations pass (~15 min)

The logo and any static artwork should move from `<img>` to `next/image` for
proper LCP on cold loads. Low-priority but easy.

## P2 — Delegate page (Safe SDK, ~1 day)

To make the Delegate page functional:

1. Integrate `@safe-global/protocol-kit` for Safe creation + owner management.
2. Implement `executeStrategy`: `ISafe.execTransactionFromModule(target, 0, data, Call)`
4. Wire `OperatorList` add/remove to on-chain `addOperator`/`removeOperator`.

## P3 — Multi-sig page (~half day)

`PendingTxList` is a stub. Options:

- **Option A** — integrate Safe Transaction Service (hosted, free for Sepolia)
  to fetch pending txs + signatures. Simpler, requires no new infra.
- **Option B** — self-host the Safe signature collection flow via apps/api.
  More work, more control.

Recommend Option A first; swap to B if we outgrow it.

## P4 — P&L tracking on Dashboard (~2 hours)

Stat card currently shows "—". Logic:

1. Subgraph aggregates each user's deposit events (cost basis) + current
   share-value (`convertToAssets(userShares)`).
2. P&L = `currentValue - totalDeposited + totalWithdrawn`.
3. Render with direction indicator + percentage.

## P5 — Camera-based QR scanning in JoinDeviceDialog (~30 min)

Currently paste-only. Add `@yudiel/react-qr-scanner` for users on mobile who
want to scan a QR from another screen. Keep paste as fallback.

## Things to verify after deploy

- [ ] Passkey smart account creates via `initCode` on first UserOp
- [ ] Paymaster sponsors vault deposits (daily caps observed)
- [ ] Cross-browser pairing completes on-chain (Browser B can sign for same address)
- [ ] Revoke key tx confirms + Paired Devices list updates
- [ ] Subgraph indexes from the correct `startBlock`
- [ ] `prefers-reduced-motion` gracefully degrades the R3F background
