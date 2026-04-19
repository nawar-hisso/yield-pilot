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

/**
 * Fetch daily TVL series by bucketing every VaultDeposit + VaultWithdrawal
 * event into UTC days and running a cumulative net balance. Returns up to
 * `days + 1` points ending at the most recent event (or null if no data).
 *
 * Strategy-generated yield is NOT reflected here — the subgraph doesn't index
 * MockAave supply events. For the deposit/withdraw-driven TVL chart this is
 * accurate; for a yield-inclusive view we'd need share-price snapshots.
 */
export async function fetchDailyTvl(
  days: number,
  chainId?: number,
): Promise<DailyTvlPoint[] | null> {
  try {
    const client = subgraphClient(chainId);
    const data = await client.request<{
      vaultDeposits: FlowEvent[];
      vaultWithdrawals: FlowEvent[];
    }>(FLOW_QUERY, { first: 1000 });

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
    // Build a day-keyed map of cumulative TVL at END of each day.
    const byDay = new Map<number, bigint>();
    let running = 0n;
    for (const d of deltas) {
      running += d.delta;
      if (running < 0n) running = 0n;
      const dayBucket = Math.floor(d.ts / ONE_DAY) * ONE_DAY;
      byDay.set(dayBucket, running);
    }

    // Walk forward from the first event through today, carrying the last
    // known TVL so empty days keep the prior value (stepped chart).
    const firstDay = Math.floor(deltas[0]!.ts / ONE_DAY) * ONE_DAY;
    const lastDay = Math.floor(Date.now() / 1000 / ONE_DAY) * ONE_DAY;
    const out: DailyTvlPoint[] = [];
    let last = 0n;
    for (let d = firstDay; d <= lastDay; d += ONE_DAY) {
      const v = byDay.get(d);
      if (v !== undefined) last = v;
      out.push({ day: d, tvlUsdc: last });
    }

    // Only return the tail `days + 1` points.
    if (out.length > days + 1) return out.slice(-(days + 1));
    return out;
  } catch {
    // No subgraph configured / unreachable / schema mismatch — caller falls back.
    return null;
  }
}
