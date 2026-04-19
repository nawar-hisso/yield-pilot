"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Percent } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { EmptyState } from "../shared/EmptyState";
import {
  fetchDailyTvl,
  fetchSharePriceSeries,
  type DailyTvlPoint,
  type SharePricePoint,
} from "../../lib/subgraphQueries";

type Point = { label: string; apy: number; ts: number };

const ONE_DAY = 86_400;
const SECONDS_PER_YEAR = 31_557_600;

/**
 * Derive APY from share-price snapshots. Each point compares its priceE18 to
 * the first snapshot; the annualised growth rate over that elapsed span is
 * the "running" APY. More meaningful than a fixed rolling window once the
 * vault has multiple days of yield accrual.
 */
function apyFromSharePrice(points: SharePricePoint[]): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [];
  const first = points[0]!;
  const multiDay = points[points.length - 1]!.ts - first.ts > ONE_DAY;
  for (const p of points) {
    let apy = 0;
    if (first.priceE18 > 0n) {
      const elapsed = Math.max(1, p.ts - first.ts);
      const growthBps = Number(((p.priceE18 - first.priceE18) * 1_000_000n) / first.priceE18) / 10_000;
      apy = growthBps * (SECONDS_PER_YEAR / elapsed);
    }
    // Clamp to a wide band — 500%+ APY is realistic when APY_BPS is cranked
    // for demos, but a short sample can still annualise into the tens of
    // thousands. The ceiling keeps one pathological point from stretching
    // the Y-axis to meaninglessness.
    apy = Math.max(-50, Math.min(10_000, apy));
    const d = new Date(p.ts * 1000);
    out.push({
      ts: p.ts,
      apy: Number(apy.toFixed(2)),
      label: multiDay
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
        : d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          }),
    });
  }
  return out;
}

/**
 * Fallback: APY derived from daily-TVL inflow deltas. Over-states true APY
 * when inflows dominate, under-states during withdrawals. Only used when the
 * subgraph hasn't been redeployed with SharePriceSnapshot yet.
 */
function apyFromTvlInflow(points: DailyTvlPoint[]): Point[] {
  const WINDOW = 7;
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - WINDOW)];
    const cur = points[i];
    if (!prev || !cur) continue;
    const prevTvl = Number(prev.tvlUsdc);
    const curTvl = Number(cur.tvlUsdc);
    let apy = 0;
    if (prevTvl > 0) {
      const growth = (curTvl - prevTvl) / prevTvl;
      apy = growth * (365 / WINDOW) * 100;
    }
    apy = Math.max(0, Math.min(25, apy));
    const d = new Date(cur.day * 1000);
    out.push({
      ts: cur.day,
      apy: Number(apy.toFixed(2)),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}

export function ApyChart() {
  const { data: sharePrice, isLoading: isPriceLoading } = useSWR<SharePricePoint[] | null>(
    "share-price-series",
    () => fetchSharePriceSeries(1000),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  // Fallback source — only consulted if the subgraph has no SharePriceSnapshot
  // entity yet (old subgraph version).
  const { data: tvlPoints, isLoading: isTvlLoading } = useSWR<DailyTvlPoint[] | null>(
    "tvl-daily-30",
    () => fetchDailyTvl(30),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { chart, source } = useMemo(() => {
    if (sharePrice && sharePrice.length > 1) {
      return { chart: apyFromSharePrice(sharePrice), source: "share-price" as const };
    }
    if (tvlPoints && tvlPoints.length > 1) {
      return { chart: apyFromTvlInflow(tvlPoints), source: "tvl-inflow" as const };
    }
    return { chart: [] as Point[], source: "none" as const };
  }, [sharePrice, tvlPoints]);

  const isLoading = isPriceLoading && isTvlLoading;
  const live = chart.length > 1;
  const last = chart[chart.length - 1];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">APY</CardTitle>
            {live ? (
              <CardDescription className="text-xs">
                {source === "share-price"
                  ? "Annualised from on-chain share-price snapshots"
                  : "Inflow proxy · redeploy the subgraph for share-price APY"}
              </CardDescription>
            ) : null}
          </div>
          {live && last ? (
            <div className="text-right">
              <div className="tabular-nums text-xl font-bold text-[color:var(--color-gold)]">
                {last.apy.toFixed(2)}%
              </div>
              <div className="text-[11px] font-normal text-[color:var(--color-text-2)]">
                {source === "share-price" ? "realised annualised" : "inflow-derived"}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {live ? (
          <div className="h-40 w-full font-mono text-[11px]">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.ceil(chart.length / 6)}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "APY"]}
                />
                <Line
                  type="monotone"
                  dataKey="apy"
                  stroke="hsl(var(--violet))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <EmptyState
              icon={Percent}
              title={isLoading ? "Loading…" : "No APY history yet"}
              description="This chart fills in once the subgraph indexes at least two share-price snapshots."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
