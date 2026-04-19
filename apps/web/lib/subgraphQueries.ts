import { gql } from "graphql-request";
import { subgraphClient } from "./subgraph";

/**
 * Typed GraphQL queries against the YieldPilot subgraph. Everything in this
 * file is safe to import from server and client components; the caller is
 * responsible for wrapping in SWR / a route handler.
 */

export interface DailyTvlPoint {
  /** Unix day bucket (seconds, midnight UTC). */
  day: number;
  /** Cumulative vault TVL in asset units (USDC 6 decimals). */
  tvlUsdc: bigint;
}

export interface TvlEventPoint {
  /** Unix timestamp (seconds) of the event. */
  ts: number;
  /** Cumulative vault TVL in asset units (USDC 6 decimals) after this event. */
  tvlUsdc: bigint;
  /** Signed delta for this event — positive for deposits, negative for withdrawals. */
  delta: bigint;
}

interface FlowEvent {
  assets: string;
  timestamp: string;
}

export interface VaultActivityEvent {
  kind: "Deposit" | "Withdraw";
  assets: bigint;
  ts: number;
  user: `0x${string}`;
  txHash: `0x${string}`;
}

export interface UserFlowSummary {
  /** Sum of all deposits this user made, USDC 6-dec. */
  totalDeposited: bigint;
  /** Sum of all withdrawals this user made, USDC 6-dec. */
  totalWithdrawn: bigint;
  /** Cost basis = totalDeposited − totalWithdrawn (never < 0). */
  costBasis: bigint;
}

export interface SharePricePoint {
  /** Unix seconds at snapshot time. */
  ts: number;
  /** Share price scaled to 1e18 (preserves precision over long spans). */
  priceE18: bigint;
}

const FLOW_QUERY = gql`
  query VaultFlows($first: Int!) {
    vaultDeposits(first: $first, orderBy: timestamp, orderDirection: asc) {
      assets
      timestamp
    }
    vaultWithdrawals(first: $first, orderBy: timestamp, orderDirection: asc) {
      assets
      timestamp
    }
  }
`;

interface ActivityEvent {
  user: string;
  assets: string;
  timestamp: string;
  transactionHash: string;
}

const SHARE_PRICE_QUERY = gql`
  query SharePrices($first: Int!) {
    sharePriceSnapshots(first: $first, orderBy: timestamp, orderDirection: asc) {
      timestamp
      priceE18
    }
  }
`;

const USER_FLOWS_QUERY = gql`
  query UserFlows($user: Bytes!, $first: Int!) {
    vaultDeposits(where: { user: $user }, first: $first, orderBy: timestamp, orderDirection: asc) {
      assets
    }
    vaultWithdrawals(where: { user: $user }, first: $first, orderBy: timestamp, orderDirection: asc) {
      assets
    }
  }
`;

const RECENT_ACTIVITY_QUERY = gql`
  query RecentActivity($first: Int!) {
    vaultDeposits(first: $first, orderBy: timestamp, orderDirection: desc) {
      user
      assets
      timestamp
      transactionHash
    }
    vaultWithdrawals(first: $first, orderBy: timestamp, orderDirection: desc) {
      user
      assets
      timestamp
      transactionHash
    }
  }
`;

interface FlowData {
  vaultDeposits: FlowEvent[];
  vaultWithdrawals: FlowEvent[];
}

async function fetchFlows(chainId?: number): Promise<FlowData | null> {
  try {
    const client = subgraphClient(chainId);
    return await client.request<FlowData>(FLOW_QUERY, { first: 1000 });
  } catch {
    return null;
  }
}

/**
 * Fetch per-event TVL series — one point per VaultDeposit / VaultWithdrawal,
 * with a leading zero-baseline point one hour before the first event. This
 * gives the chart the actual intra-day shape (every deposit / withdraw shows
 * up as its own vertex), instead of collapsing to one value per UTC day.
 *
 * Strategy-generated yield is NOT reflected — subgraph doesn't index MockAave
 * supply events. Deposit/withdraw-driven TVL only.
 */
export async function fetchTvlSeries(chainId?: number): Promise<TvlEventPoint[] | null> {
  const data = await fetchFlows(chainId);
  if (!data) return null;

  const deltas: { ts: number; delta: bigint }[] = [];
  for (const e of data.vaultDeposits) {
    deltas.push({ ts: Number(e.timestamp), delta: BigInt(e.assets) });
  }
  for (const e of data.vaultWithdrawals) {
    deltas.push({ ts: Number(e.timestamp), delta: -BigInt(e.assets) });
  }
  if (deltas.length === 0) return [];
  deltas.sort((a, b) => a.ts - b.ts);

  // Seed a zero point one hour before the first event so the chart always
  // shows the ramp from $0, even when everything happens in a small window.
  const ONE_HOUR = 3600;
  const out: TvlEventPoint[] = [
    { ts: deltas[0]!.ts - ONE_HOUR, tvlUsdc: 0n, delta: 0n },
  ];
  let running = 0n;
  for (const d of deltas) {
    running += d.delta;
    if (running < 0n) running = 0n;
    out.push({ ts: d.ts, tvlUsdc: running, delta: d.delta });
  }
  return out;
}

/**
 * Fetch daily TVL series by bucketing every VaultDeposit + VaultWithdrawal
 * event into UTC days and running a cumulative net balance. Returns up to
 * `days + 1` points ending at today (or null if no data).
 *
 * Used by the APY derivation, which needs evenly-spaced daily samples.
 */
export async function fetchDailyTvl(
  days: number,
  chainId?: number,
): Promise<DailyTvlPoint[] | null> {
  const data = await fetchFlows(chainId);
  if (!data) return null;

  const deltas: { ts: number; delta: bigint }[] = [];
  for (const e of data.vaultDeposits) {
    deltas.push({ ts: Number(e.timestamp), delta: BigInt(e.assets) });
  }
  for (const e of data.vaultWithdrawals) {
    deltas.push({ ts: Number(e.timestamp), delta: -BigInt(e.assets) });
  }
  if (deltas.length === 0) return [];
  deltas.sort((a, b) => a.ts - b.ts);

  const ONE_DAY = 86_400;
  const byDay = new Map<number, bigint>();
  let running = 0n;
  for (const d of deltas) {
    running += d.delta;
    if (running < 0n) running = 0n;
    const dayBucket = Math.floor(d.ts / ONE_DAY) * ONE_DAY;
    byDay.set(dayBucket, running);
  }

  const firstDay = Math.floor(deltas[0]!.ts / ONE_DAY) * ONE_DAY;
  const lastDay = Math.floor(Date.now() / 1000 / ONE_DAY) * ONE_DAY;
  const out: DailyTvlPoint[] = [{ day: firstDay - ONE_DAY, tvlUsdc: 0n }];
  let last = 0n;
  for (let d = firstDay; d <= lastDay; d += ONE_DAY) {
    const v = byDay.get(d);
    if (v !== undefined) last = v;
    out.push({ day: d, tvlUsdc: last });
  }

  if (out.length > days + 1) return out.slice(-(days + 1));
  return out;
}

/**
 * Fetch the most recent vault deposits and withdrawals, merged into a single
 * descending timeline. Intended as a stopgap for the Live Activity feed until
 * so there's no reason to leave the feed empty.
 */
export async function fetchRecentActivity(
  limit = 10,
  chainId?: number,
): Promise<VaultActivityEvent[] | null> {
  try {
    const client = subgraphClient(chainId);
    const data = await client.request<{
      vaultDeposits: ActivityEvent[];
      vaultWithdrawals: ActivityEvent[];
    }>(RECENT_ACTIVITY_QUERY, { first: limit });

    const merged: VaultActivityEvent[] = [
      ...data.vaultDeposits.map((e): VaultActivityEvent => ({
        kind: "Deposit",
        assets: BigInt(e.assets),
        ts: Number(e.timestamp),
        user: e.user as `0x${string}`,
        txHash: e.transactionHash as `0x${string}`,
      })),
      ...data.vaultWithdrawals.map((e): VaultActivityEvent => ({
        kind: "Withdraw",
        assets: BigInt(e.assets),
        ts: Number(e.timestamp),
        user: e.user as `0x${string}`,
        txHash: e.transactionHash as `0x${string}`,
      })),
    ];
    merged.sort((a, b) => b.ts - a.ts);
    return merged.slice(0, limit);
  } catch {
    return null;
  }
}

/**
 * Sum every Deposit + Withdrawal this user has ever made against the vault.
 * costBasis = totalDeposited − totalWithdrawn, floored at 0 so we never
 * report negative cost. Compare to the vault's convertToAssets(userShares)
 * for realized + unrealized P&L.
 *
 * Subgraph stores `user` as the depositor's own address for deposits and as
 * the share-owner's address for withdrawals (ERC-4626 semantics). That matches
 * wallet.address — the same value wagmi exposes for both EOA and passkey paths.
 */
export async function fetchUserFlows(
  user: `0x${string}`,
  chainId?: number,
): Promise<UserFlowSummary | null> {
  try {
    const client = subgraphClient(chainId);
    const data = await client.request<{
      vaultDeposits: { assets: string }[];
      vaultWithdrawals: { assets: string }[];
    }>(USER_FLOWS_QUERY, { user: user.toLowerCase(), first: 1000 });

    let totalDeposited = 0n;
    for (const d of data.vaultDeposits) totalDeposited += BigInt(d.assets);
    let totalWithdrawn = 0n;
    for (const w of data.vaultWithdrawals) totalWithdrawn += BigInt(w.assets);
    const costBasis = totalDeposited > totalWithdrawn ? totalDeposited - totalWithdrawn : 0n;
    return { totalDeposited, totalWithdrawn, costBasis };
  } catch {
    return null;
  }
}

/**
 * Fetch the SharePriceSnapshot series indexed by the subgraph. Each snapshot
 * is captured at a Deposit or Withdraw event — price reflects vault.totalAssets
 * / vault.totalSupply at that block, so strategy yield is already baked in.
 * Returns null when the subgraph URL is unset or hasn't been redeployed with
 * the SharePriceSnapshot entity yet (caller falls back to the TVL-inflow APY).
 */
export async function fetchSharePriceSeries(
  limit = 1000,
  chainId?: number,
): Promise<SharePricePoint[] | null> {
  try {
    const client = subgraphClient(chainId);
    const data = await client.request<{
      sharePriceSnapshots: { timestamp: string; priceE18: string }[];
    }>(SHARE_PRICE_QUERY, { first: limit });
    return data.sharePriceSnapshots.map((s) => ({
      ts: Number(s.timestamp),
      priceE18: BigInt(s.priceE18),
    }));
  } catch {
    return null;
  }
}

/**
 * Annualised APY between the first + last snapshot in `points`. Uses simple
 * (non-compounding) rate: APY = (endPrice / startPrice − 1) × (year / span).
 * Returns null when there's < 2 points or the span is too short to be
 * meaningful (< 1 hour).
 */
export function computeApyFromSharePrice(points: SharePricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const spanSeconds = last.ts - first.ts;
  if (spanSeconds < 3600) return null; // avoid noisy early readings
  if (first.priceE18 === 0n) return null;
  const SECONDS_PER_YEAR = 31_557_600;
  // growth = (last − first) / first, scaled via 1e18 denominators for precision.
  const growthBps = Number(((last.priceE18 - first.priceE18) * 1_000_000n) / first.priceE18) / 10_000;
  return growthBps * (SECONDS_PER_YEAR / spanSeconds);
}
