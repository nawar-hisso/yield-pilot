# YieldPilot — Research

## Context


---

## 1. ERC-4626 inflation attacks

### Attack mechanics

The first-depositor donation attack (a.k.a. "inflation attack") exploits the round-down math in `convertToShares`:

1. Attacker is the first depositor. They call `deposit(1, attacker)` — receive 1 share for 1 wei of asset.
2. Attacker directly transfers `N` underlying tokens to the vault address (bypassing `deposit`). This bumps `totalAssets()` without bumping `totalSupply()`.
3. Victim calls `deposit(D, victim)` with `D < N`. Shares minted = `D * totalSupply() / totalAssets()` = `D * 1 / (N+1)`, which rounds down to **0**.
4. Victim's assets are now effectively owned by the attacker (who still holds the only share) and can be withdrawn via `redeem(1, attacker, attacker)` returning `D + N + 1`.

Economic cost to the attacker: `N` tokens locked up (recovered on exit). Profit: any victim deposit below `N`. Historical losses: ~$75k in early Rari fuses, plus several audit findings on forked vaults without OZ's mitigation.

### OZ v5 mitigation in YieldVault

OpenZeppelin's v5 `ERC4626.sol` defends via a **virtual decimals offset**. `_decimalsOffset()` returns a `uint8` (default `0`); internally, share math uses `totalSupply + 10**offset` and `totalAssets + 10**offset`. An offset of `N` makes a donation attack cost roughly `10**N` of the attacker's funds per wei the victim could lose — at offset 6, even dust victims are safe.

`packages/contracts/contracts/core/YieldVault.sol` today imports `ERC4626` but does **not** override `_decimalsOffset()` — meaning the offset is `0` and the donation attack is live. Add this override (per `docs/CONTRACTS.md` §4):

```solidity
/// @dev Virtual-share offset. 6 matches MockUSDC's decimals, pushing the
///      donation-attack breakeven to >=1e6 tokens — economically infeasible.
///      See: https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack
function _decimalsOffset() internal pure override returns (uint8) {
    return 6;
}
```

Drop this next to the `totalAssets()` override (line 45-49). No other changes required — OZ's `_convertToShares` / `_convertToAssets` internals read `_decimalsOffset()` on every call. Do **not** pair this with a seed deposit; the virtual offset and a real seed deposit are redundant and the seed deposit creates its own dust-griefing surface.

### Test case to write

Add to `packages/contracts/test/YieldVault.inflation.test.ts`:

```ts
it("resists donation inflation attack with _decimalsOffset=6", async () => {
  const { vault, usdc, attacker, victim } = await loadFixture(deployFixture);

  // 1. Attacker front-runs with 1 wei deposit
  await usdc.connect(attacker).approve(vault.target, 1n);
  await vault.connect(attacker).deposit(1n, attacker.address);
  expect(await vault.totalSupply()).to.equal(10n ** 6n + 1n); // virtual + 1

  // 2. Attacker donates 1e12 tokens directly (bypass deposit)
  const donation = 1_000_000_000_000n; // 1M mUSDC
  await usdc.connect(attacker).transfer(vault.target, donation);

  // 3. Victim deposits 1000 mUSDC — must get NON-ZERO shares
  const victimDeposit = 1_000_000_000n; // 1000 mUSDC
  await usdc.connect(victim).approve(vault.target, victimDeposit);
  const sharesOut = await vault.connect(victim).deposit.staticCall(
    victimDeposit, victim.address,
  );
  expect(sharesOut).to.be.gt(0n);

  // 4. Victim can redeem approximately what they put in (accounting for donation dilution)
  await vault.connect(victim).deposit(victimDeposit, victim.address);
  const redeemable = await vault.convertToAssets(sharesOut);
  // With offset=6 and no attacker dilution, victim's withdrawable >= ~99% of deposit
  expect(redeemable).to.be.gte((victimDeposit * 99n) / 100n);
});
```

This test is tagged **#2** in `docs/CONTRACTS.md §11`. It must fail without the `_decimalsOffset()` override and pass with it — confirming the mitigation is actually doing work.

---


### Known pitfalls

Sourced from `knowledge/primitives/defi-infra/safe-custom-modules.md` plus Safe's own guard docs:

2. **Owners can lock themselves out.** The guard applies to *all* Safe txs, including owner-initiated ones. An overly narrow allow-list means owners cannot even rotate owners, remove the module, or disable the guard itself — the Safe becomes permanently restricted to the module's action set.
3. **Non-atomic install window.** `enableModule` and `setGuard` are separate Safe transactions. Between them, the module is live but no guard is checking its output. An attacker who can force a module tx in that window executes freely.
4. **Guards cannot carry state.** `checkTransaction` is `view`, so per-day budgets, rate limits, and "max 1 large tx per hour" logic cannot live in the guard — only in the module or the caller.

### YieldPilot mitigations


- **Install order is spec'd.** `CONTRACTS.md §6` setup sequence: (1) `enableModule`, (2) `setGuard`, (3) `addOperator`. The doc notes this should be flipped to guard-first, or batched via `MultiSend`. **Action for executor: update `CONTRACTS.md §6` and the on-boarding frontend (`/delegate` page) to call `setGuard` BEFORE `enableModule`, or build one `MultiSend` tx containing both.**
- **Allow-list is explicit per target + selector.** The allow-list table in `CONTRACTS.md §6` enumerates the six allowed pairs (`YieldVault.deposit/withdraw`, `MockAave.supply/withdraw`, `MockUSDC.approve`) and four explicitly denied pairs (`transfer`, `removeOwner`, `disableModule`, delegatecall). The executor must not add wildcards.
- **Module enforces `operation = 0` (Call).** `CONTRACTS.md §2.5` mandates that `executeStrategy` calls `execTransactionFromModule(target, 0, data, 0)` — the hard-coded trailing zero blocks delegatecall at the module layer.
- **Operator registry is Safe-gated.** `addOperator` checks `msg.sender == safe` (spec'd in `CONTRACTS.md §2.5`). Only a Safe tx (which clears M-of-N) can mutate operator set — no EOA path.

### Remaining open questions

2. **Do we want a dedicated emergency "unbrick" module?** If the allow-list is wrong post-deploy and the owner set has rotated, recovery is hard. A one-shot unbrick module held by the deployer multisig, installed but not yet enabled, would give us 24h of escape hatch. Optional for MVP; document as Phase 7+ work.
3. **Operator rate-limiting.** The guard is stateless so it cannot cap operator call frequency. For MVP we rely on the module's operator allowlist being small and revocable; post-MVP, a stateful module wrapper with sliding-window counters is the upgrade.

---

## 3. ERC-4337 Paymaster spending caps

### ERC-7562 storage rules

ERC-7562 ("Account Abstraction Validation Scope Rules") constrains what validation functions may read — both `validateUserOp` on the account and `validatePaymasterUserOp` on the paymaster. Bundlers enforce these rules locally and silently drop any UserOp that violates them (no on-chain revert, just a dropped mempool entry, which is hellish to debug).

Concretely for `Paymaster._validatePaymasterUserOp`:

- **Allowed:** read immutables, the paymaster's own storage slots **not keyed by `userOp.sender`**, `block.timestamp`, `block.chainid`, `msg.sender` (EntryPoint).
- **Forbidden:** reads of storage keyed by `userOp.sender` in contracts other than the account itself; external calls to contracts not on the entrypoint's allow-list; any mutable per-user storage read (this is the big one).

The skeleton `Paymaster.sol` currently exposes `gasUsed[vault]` as a mutable mapping. Reading `gasUsed[vault]` inside `_validatePaymasterUserOp` is technically allowed (vault is not the sender) — but reading `perUserBudget[userOp.sender]` or `nonces[userOp.sender]` would trip the bundler's validation filter. **Rule for executor: validation code may read `allowedTargets[vault]` and immutables; enforcement of `gasUsed <= gasBudget` lives in `_postOp`, not in validation.**

The signature-verification path (per `CONTRACTS.md §2.3`) is safe because it only reads the immutable `verifier` address and does ECDSA recovery over calldata + `block.chainid` + `address(this)` — no mutable per-user storage.

### postOp revert risks

`_postOp` runs after UserOp execution, with `actualGasCost` known. Critical rule from `knowledge/primitives/account-abstraction/paymaster.md`: **a revert in `_postOp` causes the EntryPoint to treat the UserOp as failed AND slashes the paymaster's stake.** The paymaster loses not just the gas-reimbursement deposit but part of its on-chain stake — and the user's operation reverts despite having already executed.

Current skeleton (`Paymaster.sol` line 46-58) has `recordSponsorship` revert on two paths:

```solidity
if (!allowedTargets[vault]) revert TargetNotAllowed(vault);
if (used > gasBudget[vault]) revert BudgetExceeded(vault, gasCost, ...);
```

For MVP where `recordSponsorship` is called externally by the admin, reverts here are fine. **But in Phase 5 when this logic migrates into `_postOp`, the reverts must be wrapped.** Pattern from `paymaster.md`:

```solidity
function _postOp(PostOpMode, bytes calldata ctx, uint256 actualGasCost, uint256) internal override {
    (address sender, address vault,) = abi.decode(ctx, (address, address, uint256));
    try this.recordSponsorshipInternal(vault, sender, actualGasCost) {
        // ok
    } catch (bytes memory err) {
        emit SponsorshipAccountingFailed(vault, sender, actualGasCost, err);
        // DO NOT REVERT — swallow and let the UserOp succeed
    }
}
```

The `try/catch` + external-self-call is required because Solidity's `try` only works on external calls. The accounting error is logged for off-chain reconciliation but never propagates to the EntryPoint.

### Cap pattern for YieldPilot

`CONTRACTS.md §10` sets **per-vault lifetime cap = 0.05 ETH** on testnet. Assessment against alternatives:

| Pattern | Where enforced | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Per-vault lifetime** (current) | `gasUsed[vault] <= gasBudget[vault]` in `_postOp` | Simple, stateless for validation, one storage slot per vault | No per-user limit — one whale UserOp can drain the whole budget | **Use for MVP** |
| **Per-user daily** | `gasUsed[user][day]` | Fair distribution, abuse-resistant | Per-user mutable storage — complicates validation if ever read there | Post-MVP |
| **Per-user lifetime** | `gasUsed[user]` | Anti-sybil | Same validation constraint | Post-MVP |
| **Hybrid: per-vault cap + per-user daily** | Both in `_postOp` | Best for production | More storage, more math | **Target for v2** |

**Action for executor in Phase 5:** keep the current per-vault-lifetime cap, add a `setDailyCap(vault, cap)` + `dailyUsed[vault][day]` check enforced in `_postOp` only. Reset on day-boundary crossing (lazy, matches the pattern in `safe-custom-modules.md`). Off-chain verifier signing (per `CONTRACTS.md §2.3`) is the real frontline — it can reject any UserOp before it ever reaches the paymaster, so the on-chain cap is a last line of defense against a compromised verifier key.

Also: **stake the paymaster.** `entryPoint.depositTo{value: 0.1 ether}(paymaster)` + `paymaster.addStake{value: 0.01 ether}(86400)`. Without both, the bundler rejects the paymaster entirely. Step 3 in `CONTRACTS.md §10` covers this.

---


### HMAC verification pattern



```ts
  if (!signingKey) return false;
  const digest = createHmac("sha256", signingKey).update(rawBody).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
```



```ts
// Keep express.json() for everything else:
app.use(express.json({ limit: "1mb" }));
app.use("/api/user", userRouter);
```


```ts
    return res.status(401).json({ error: "invalid signature" });
  }
  const payload = JSON.parse(rawBody);
  // ...zod parse on `payload`, not `req.body`
});
```


### Idempotency via ProcessedEvent


Three refinements for the executor:

1. **Add `chainId` to the dedupe key.** The same `txHash` can exist on both Sepolia and Base Sepolia post-reorg on one chain. Current code stores `chainId` as a column but keys only on `txHash:logIndex`. Change the unique constraint to `@@unique([key, chainId])` in `prisma/schema.prisma`, or fold `chainId` into the key string: `${chainId}:${txHash}:${logIndex}`.
2. **TTL the table.** `ProcessedEvent` will grow unbounded. Add a cron job (or `pg_cron`) to delete rows older than 14 days — after finality on all target chains.
3. **Use `upsert` with `skipDuplicates` instead of try/catch.** The current try/catch pattern swallows ALL database errors, not just unique-constraint violations. If Postgres is momentarily unreachable, the event is silently dropped. Prefer `prisma.processedEvent.create({ data })` wrapped in a specific check on `P2002` Prisma error code, or use `createMany({ data, skipDuplicates: true })` which is atomic and clearer.

### Failure handling


Missing from current code (add in Phase 6):

2. **Reorg handling.** `ProcessedEvent` dedupes but doesn't rewind. If a deposit event is re-fired for a rolled-back block and a new, canonical deposit event comes in with a different `txHash`, we broadcast the canonical one. But any balance cache we build from these events must also track `blockNumber` and invalidate on `removed: true` flags. MVP: only trust events where `block.confirmations >= 12` for Sepolia.
3. **Signature mismatch observability.** Log `signature` (NOT the signing key) and request ID on every 401 so we can trace replay-vs-misconfig in production. Current `logger.warn` does this — keep it.
4. **Structured error for malformed bodies.** Zod `parsed.error.flatten()` is being returned verbatim in the 400 response; that leaks internal shape. Replace with `{ error: "bad payload" }` and log the zod error server-side only.

---

## 5. WebSocket auth for `apps/api`

### Current posture (Phase 6 acceptable)

`apps/api/src/ws/server.ts` currently accepts every connection on `WS_PATH` without authentication — `attachWs` logs on connect, sends a 30s heartbeat, and `broadcast()` in `services/broadcast.ts` fan-outs to every open socket. For the Phase 6 feature set this is acceptable:

- **What's NOT broadcast:** no user preferences, no wallet addresses beyond what's in the public event, no signed messages, no PII. The `User` and `Notification` Prisma models are accessed only via REST (`apps/api/src/routes/user.ts`).


### Hardening options before Phase 7

Three viable paths, ordered by effort:

1. **Short-lived JWT at connect (simplest).** Browser calls `POST /api/auth/ws-ticket` over authenticated REST, backend issues a 60-second JWT signed with `WS_TICKET_SECRET` containing `{ address, chainId, exp }`. Client connects with `?ticket=<jwt>`; server validates on `wss.on('connection', ...)`, stores `address` on the socket, rejects unauthenticated sockets. Trade-off: requires the REST side to already know who the user is (SIWE or session cookie).
2. **SIWE message signed at connect (Web3-native).** Client signs an EIP-4361 message with expiration, sends `{ message, signature }` on the first WS frame. Server verifies with viem's `verifyMessage`, binds the socket to `address`. No REST round-trip, but couples the WS handshake to wallet availability (Web3Auth must be ready at connect time). **Recommended** given our Web3Auth-first stack.
3. **Per-request token in query param (simplest, weakest).** `?token=<random-uuid>` generated per-session. Works but leaks into access logs and server-side debugging tools; rotate aggressively and never log the full URL.

Socket state additions regardless of choice:

```ts
interface AuthedSocket extends WebSocket {
  address?: `0x${string}`;
  chainId?: number;
  subscribedAt?: number;
}
```

### Per-user topic filtering

Once sockets carry `address`, rewrite `broadcast()` from `apps/api/src/services/broadcast.ts` (unread but per `INTEGRATIONS.md` signature: broadcasts to every client) into a selective emit:

```ts
export function broadcast(payload: RealtimePayload) {
  const wss = getWss();
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients as Set<AuthedSocket>) {
    if (client.readyState !== client.OPEN) continue;
    // Public channels: send to everyone (backwards-compat with activity feed)
    if (payload.type === "vault.event" && !payload.payload.user) {
      client.send(msg);
      continue;
    }
    // Private channels: only to the matching address
    if (payload.payload.user && client.address?.toLowerCase() === payload.payload.user.toLowerCase()) {
      client.send(msg);
    }
  }
}
```

This lets us keep the public activity feed while enabling private channels (e.g. "your withdrawal is processing") without re-architecting.

### Rate-limiting + connection caps

Before opening to the public internet:

- **Connection cap per IP:** use `ws`'s `verifyClient` hook + a small LRU cache (`{ ip -> count }`) to cap at 10 concurrent sockets per IP. Reject with 429 on excess.
- **Per-socket message rate:** clients should only send `pong` responses and (optionally) subscription messages. Rate-limit inbound messages to 10/sec/socket; disconnect on sustained excess. The server currently discards all inbound messages — add an `ws.on('message', ...)` handler that either parses a subscription protocol or disconnects.
- **Heartbeat + stale-client eviction:** current code pings every 30s but never disconnects on missing pong. Add per-socket `isAlive = false` flipped in `ws.on('pong', () => isAlive = true)`; in the interval, terminate sockets where `isAlive === false`.

### Recommendation


Before Phase 7 or any private-channel feature: **add SIWE-at-connect (option 2)** + per-user topic filtering + per-IP connection cap. Two days of work; ~200 lines including tests. Do not open private channels to the public WS endpoint without these in place.

---

## References

- OpenZeppelin ERC-4626 inflation attack — https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack
- ERC-7562 Validation Scope Rules — https://eips.ethereum.org/EIPS/eip-7562
- ERC-4337 Paymaster spec — https://eips.ethereum.org/EIPS/eip-4337#paymasters
- Pimlico verifying paymaster source — https://github.com/pimlicolabs/singleton-paymaster
- SIWE (EIP-4361) — https://eips.ethereum.org/EIPS/eip-4361
- `knowledge/primitives/tokens/erc4626.md`
- `knowledge/primitives/account-abstraction/erc4337.md`
- `knowledge/primitives/account-abstraction/paymaster.md`
- `knowledge/primitives/defi-infra/safe-multisig.md`
- `knowledge/primitives/defi-infra/safe-custom-modules.md`
- `docs/CONTRACTS.md` §4 (inflation), §6 (Safe flow), §2.3 (paymaster)
