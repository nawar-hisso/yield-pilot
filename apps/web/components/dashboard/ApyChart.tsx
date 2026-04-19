"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Percent } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { EmptyState } from "../shared/EmptyState";
import { fetchDailyTvl, type DailyTvlPoint } from "../../lib/subgraphQueries";

type Point = { day: string; apy: number };

/**
 * Derive a rough APY proxy from the daily-TVL series. Strategy yield accrues
 * off-chain for the mock vault, so we don't have direct share-price deltas
 * to work with; instead we treat 7-day TVL growth as a stand-in. This over-
 * states true APY when inflows dominate and understates it during withdraws,
 * so it's clearly labelled "inflow-derived" until a sharePrice entity lands.
 */
function derivedApy(points: DailyTvlPoint[]): Point[] {
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
      day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      apy: Number(apy.toFixed(2)),
    });
  }
  return out;
}

export function ApyChart() {
  const { data: points, isLoading } = useSWR<DailyTvlPoint[] | null>(
    "tvl-daily-30",
    () => fetchDailyTvl(30),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const live = points !== undefined && points !== null && points.length > 7;
  const chart = useMemo(() => (live ? derivedApy(points as DailyTvlPoint[]) : []), [live, points]);
  const last = chart[chart.length - 1];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">APY</CardTitle>
            {live ? (
              <CardDescription className="text-xs">
                7-day rolling · derived from subgraph inflow deltas
              </CardDescription>
            ) : null}
          </div>
          {live ? (
            <div className="text-right">
              <div className="tabular-nums text-xl font-bold text-[color:var(--color-gold)]">
                {last ? last.apy.toFixed(2) : "—"}%
              </div>
              <div className="text-[11px] font-normal text-[color:var(--color-text-2)]">inflow-derived</div>
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
                  dataKey="day"
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
              description="This chart fills in once the subgraph has 7+ days of share-price history."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
