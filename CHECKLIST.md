# YieldPilot — Checklist

Working docs for what's shipped, what to verify, and what's still on the
board. Tick items as you go.

Last verified commit: `da6be6d` (Sepolia, chain 11155111).

---

## 🧪 To Test

### Auth

- [ ] **EOA connect** — header → Connect → "Use my wallet" → Reown → MetaMask → address pill + EOA badge
- [ ] **Passkey create** — header → Connect → "Create smart account" → Touch ID → counterfactual address pill + Passkey badge
- [ ] **Disconnect** (EOA) clears wagmi session, header returns to "Connect"
- [ ] **Disconnect** (passkey) clears local adopted passkey, header returns to "Connect"
- [ ] **Re-open dApp in same browser** — existing passkey auto-loads from IndexedDB, header shows pill immediately
- [ ] **Pair device — Browser A (host)** — settings → Pair another device → QR / link shown → "✓ Paired" after Browser B approves
- [ ] **Pair device — Browser B (guest)** — paste link → Touch ID → auto-closes with "✓ Linked" after on-chain confirmation (either WS or chain-poll path)
- [ ] **Paired session reload** — Browser B refresh → still connected to shared smart-account address
- [ ] **Revoke key** — settings → revoke a non-primary key → tx mines → paired browser falls out of session

### Vault — EOA lane

- [x] **mUSDC faucet** — /vault → Faucet button → 1,000 mUSDC minted to EOA
- [ ] **Deposit** — enter amount → Approve tx (MetaMask) → Deposit tx → stats update, mUSDC balance drops, shares minted
- [ ] **Withdraw** — enter shares → Withdraw tx → mUSDC returned to EOA
- [ ] **TVL chart ticks up** on dashboard after deposit confirms + subgraph indexes (~30-60s)

### Vault — Passkey lane (gasless)

- [x] **Deposit — first time** — 2 Touch IDs (approve + deposit), ~60s total, funds in vault
- [ ] **Deposit — second time** — 1 Touch ID (allowance already max), ~30s
- [ ] **Stats update post-deposit** — "My Position" + "TVL" tiles both tick up
- [ ] **Deposit from Browser B (paired)** — paired browser's Touch ID also works for the shared account
- [ ] **Dashboard TVL chart** updates within 60s of confirm

### Dashboard

- [ ] **Hero copy** — disconnected shows "Deposit. Delegate. Earn." with Connect CTA
- [ ] **Hero copy** — connected shows portfolio value in display font
- [ ] **StatCards** — all 4 render (Portfolio, P&L, APY, TVL); loading skeletons briefly visible
- [ ] **TVL chart** — 30-day rolling window, area chart with cyan gradient fill, tooltip on hover
- [ ] **APY chart** — violet line, tooltip shows rolling-window APY
- [ ] **Command palette (⌘K)** — opens, navigates to Vault / Delegate / Settings

### Settings

- [ ] **Paired devices list** — shows all on-chain keys with nicknames (loads from `authorizedKeys()`)
- [ ] **Pair new device flow** — QR + paste link both render
- [ ] **Revoke non-primary key** — UserOp submits → after mine, list refreshes without that key
- [ ] **Can't revoke primary key** — button disabled / gated

### Responsive + A11y

- [ ] **Mobile viewport (375px)** — sidebar collapses to bottom nav
- [ ] **Keyboard nav** — Tab through header → sidebar → main content, focus rings visible
- [ ] **Dark theme tokens** — all text legible, no white-on-white

### Edge cases / failure modes

- [ ] **Deposit without enough mUSDC** — button disabled "Insufficient balance"
- [ ] **Wrong chain** (switch MetaMask to Base Sepolia while on /vault) — UI shows warning / disables writes
- [ ] **Pimlico rate-limit** during deposit — UserOp retries with fresh gas / bundler fallback
- [ ] **Paymaster daily cap hit** — 403 from `/api/paymaster/sponsor` with clear error toast
- [ ] **WS relay down during pair** — chain-poll path still finalizes

---

## 🚧 To Implement

### P0 — unblocks full vault demo

- [x] **Passkey withdraw** — mirror `useDeposit`'s passkey branch. File: `apps/web/hooks/useWithdraw.ts`
- [x] **Atomic passkey deposit** — Paymaster now accepts `executeBatch`; first deposit = 1 Touch ID

### P1 — portfolio completeness

- [ ] **P&L stat card** — cost-basis from subgraph (sum of Deposit events) vs. `convertToAssets(userShares)`. 2 hr
- [ ] **True APY from on-chain share-price** — subgraph `SharePriceSnapshot` entity snapshot per Deposit/Withdraw. 3 hr
- [ ] **Nonce race retry UX** — on AA25 (stale nonce), refresh and rebuild UserOp transparently. 10 min
- [ ] **Camera QR scanner for pairing** — `@yudiel/react-qr-scanner` in `PairDeviceDialog`. 30 min

### P2 — Delegate + Multi-sig

- [ ] **Delegate page fully wired** — Safe SDK → create Safe → enable Guard → attach Module → `executeStrategy` no longer reverts. 1 day
- [ ] **Multi-sig page** — Safe Transaction Service client → list pending → sign / reject / execute. 1 day

### P3 — ops + deployment

- [ ] **Etherscan verify** — retry `hardhat verify` on all 8 contracts once DNS resolves `api.etherscan.io`. 10 min
- [ ] **Deploy frontend** — Vercel deploy of `apps/web` pointed at hosted api. 30 min
- [ ] **Base Sepolia deploy** — reuse Ignition module + scripts, fill `_BASE_SEPOLIA` envs. 1 hr

### P4 — nice-to-have polish

- [ ] **Onboarding tour** — first-visit modal explaining passkey smart accounts
- [ ] **Activity feed enrichments** — icons per event type (deposit / withdraw / pair / revoke), USD values, tx-explorer links
- [ ] **Notifications** — email / push on events (requires Postgres persistence + worker)
- [ ] **PWA manifest** — installable on mobile (Add to Home Screen)
- [ ] **Transaction history table** — queryable per-user on /settings or new /activity route

---

## 📌 Notes

- On-chain setup is done: Paymaster `0xa774…90B2` (batch-aware, redeploy 2026-04-20), Vault `0x62B6…Dd2B` (auto-supply + auto-recall, redeploy 2026-04-20; old vault `0x4662…50AF` is retired), Factory `0xe38f…7AC9`, USDC `0x2a04…7BDc`.
- Shared smart account under test: `0xA08a68b9D9ecffE59A7A41eB8dB08924104d2e4f` — currently holds 100k mUSDC, 6 authorized keys. Pre-allowed in the new paymaster via `setAllowedSender` so it keeps working without redeploying the account.
- Paymaster allowed targets (on-chain `setTarget = true`): Vault, USDC, any smart account self-call.
- Paymaster off-chain policy (`apps/api/src/services/paymaster-policy.ts`) matches the on-chain list; daily caps per sender.
- Passkey deposits are now a **single UserOp via `executeBatch`** (atomic approve + deposit). First deposit = 1 Touch ID.