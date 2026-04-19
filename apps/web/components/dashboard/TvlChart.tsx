"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { fetchDailyTvl, type DailyTvlPoint } from "../../lib/subgraphQueries";
import { USDC_DECIMALS } from "../../lib/contracts";

type Point = { day: string; tvl: number };

/** mulberry32 — tiny seeded PRNG. Produces the same series on SSR + CSR, which
 *  keeps the skeleton from jumping when the subgraph returns no data yet. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_EPOCH_MS = Date.UTC(2026, 3, 1);
const USDC_DIVISOR = 10n ** BigInt(USDC_DECIMALS);

function mockSeries(days = 30): Point[] {
  const rand = mulberry32(0xa71d9 + days);
  const out: Point[] = [];
  let v = 1200;
  for (let i = days; i >= 0; i--) {
    v += (Math.sin(i / 4) * 0.5 + rand() * 0.4) * 60;
    v = Math.max(50, v);
    const d = new Date(DEMO_EPOCH_MS - i * 86_400_000);
    out.push({
      day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      tvl: Math.round(v),
    });
  }
  return out;
}

function pointsToChart(points: DailyTvlPoint[]): Point[] {
  return points.map((p) => {
    const d = new Date(p.day * 1000);
    // Round TVL to the nearest whole dollar. USDC has 6 decimals so divide out.
    const tvl = Number(p.tvlUsdc / USDC_DIVISOR);
    return {
      day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      tvl,
    };
  });
}

export function TvlChart() {
  const { data: points } = useSWR<DailyTvlPoint[] | null>(
    "tvl-daily-30",
    () => fetchDailyTvl(30),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const chart = useMemo(() => {
    if (points && points.length > 1) return pointsToChart(points);
    return mockSeries();
  }, [points]);

  const live = points !== undefined && points !== null && points.length > 1;
  const first = chart[0];
  const last = chart[chart.length - 1];
  const delta = first && last && first.tvl > 0 ? ((last.tvl - first.tvl) / first.tvl) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">Vault TVL</CardTitle>
            <CardDescription className="text-xs">
              {live
                ? `Last 30 days · live from subgraph`
                : `Mock 30-day trend — awaiting on-chain deposits.`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums">
              ${last?.tvl.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] font-medium text-success">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}% · 30d
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-40 w-full font-mono text-[11px]">
          <ResponsiveContainer>
            <AreaChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="tvlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "TVL"]}
              />
              <Area
                type="monotone"
                dataKey="tvl"
                stroke="hsl(var(--accent))"
                fill="url(#tvlFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
