"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

type Point = { day: string; tvl: number };

/** mulberry32 — tiny seeded PRNG. Produces the same series on SSR + CSR, which
 *  avoids React hydration mismatches until the subgraph replaces this demo data. */
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

/** Seeds deterministic demo history. Day labels are relative to a fixed epoch
 *  (not `Date.now()`) so SSR + CSR produce byte-identical markup. */
const DEMO_EPOCH_MS = Date.UTC(2026, 3, 1); // 2026-04-01 UTC

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

export function TvlChart() {
  const data = useMemo(() => mockSeries(), []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">Vault TVL</CardTitle>
            <CardDescription className="text-xs">
              Mock 30-day trend — live data plugs in once the subgraph deploys.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-semibold tabular-nums">
              ${data[data.length - 1]?.tvl.toLocaleString()}
            </div>
            <div className="text-[11px] text-success">
              +{((data[data.length - 1]!.tvl - data[0]!.tvl) / data[0]!.tvl * 100).toFixed(1)}% · 30d
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-40 w-full">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
                interval={Math.ceil(data.length / 6)}
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
