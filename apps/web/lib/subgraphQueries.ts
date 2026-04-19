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
