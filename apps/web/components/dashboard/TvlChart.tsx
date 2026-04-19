"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { EmptyState } from "../shared/EmptyState";
import { fetchTvlSeries, type TvlEventPoint } from "../../lib/subgraphQueries";
import { USDC_DECIMALS } from "../../lib/contracts";

type Point = { ts: number; label: string; tvl: number };

const USDC_DIVISOR = 10n ** BigInt(USDC_DECIMALS);
const ONE_DAY = 86_400;

/**
 * Pick a label style per-point depending on how wide the overall span is.
 * Span < 1 day → show "HH:MM" (intra-day). Otherwise show "Mon DD" (multi-day).
 */
function pointsToChart(points: TvlEventPoint[]): Point[] {
  if (points.length === 0) return [];
  const first = points[0]!.ts;
  const last = points[points.length - 1]!.ts;
  const multiDay = last - first > ONE_DAY;
  return points.map((p) => {
    const d = new Date(p.ts * 1000);
    const label = multiDay
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        });
    const tvl = Number(p.tvlUsdc / USDC_DIVISOR);
    return { ts: p.ts, label, tvl };
  });
}

function fullLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function TvlChart() {
  const { data: points, isLoading } = useSWR<TvlEventPoint[] | null>(
    "tvl-series",
    () => fetchTvlSeries(),
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );

  const live = points !== undefined && points !== null && points.length > 1;
  const chart = useMemo(() => (live ? pointsToChart(points as TvlEventPoint[]) : []), [live, points]);
  const first = chart[0];
  const last = chart[chart.length - 1];
  const delta = first && last && first.tvl > 0 ? ((last.tvl - first.tvl) / first.tvl) * 100 : 0;
  const windowLabel = live && points && points.length > 0
    ? ((points[points.length - 1]!.ts - points[0]!.ts > ONE_DAY)
        ? `${((points[points.length - 1]!.ts - points[0]!.ts) / ONE_DAY).toFixed(0)}d`
        : "today")
    : "";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">Vault TVL</CardTitle>
            {live ? (
              <CardDescription className="text-xs">
                Per-event · live from subgraph
              </CardDescription>
            ) : null}
          </div>
          {live ? (
            <div className="text-right">
              <div className="text-xl font-bold tabular-nums">${last?.tvl.toLocaleString() ?? "—"}</div>
              <div className="text-[11px] font-medium text-success">
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}% · {windowLabel}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {live ? (
          <div className="h-40 w-full font-mono text-[11px]">
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="tvlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                  labelFormatter={(_label: string, payload?: Array<{ payload?: Point }>) => {
                    const ts = payload?.[0]?.payload?.ts;
                    return ts ? fullLabel(ts) : "";
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
        ) : (
          <div className="px-4 pb-4">
            <EmptyState
              icon={Activity}
              title={isLoading ? "Loading…" : "No TVL history yet"}
              description="This chart fills in once the subgraph indexes deposit and withdraw events."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
