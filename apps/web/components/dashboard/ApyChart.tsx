"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

type Point = { day: string; apy: number };

function mockApy(days = 30): Point[] {
  const out: Point[] = [];
  let v = 4.6;
  for (let i = days; i >= 0; i--) {
    v += (Math.sin(i / 5) * 0.1 + (Math.random() - 0.4) * 0.08);
    v = Math.max(1.5, Math.min(7, v));
    const d = new Date(Date.now() - i * 86_400_000);
    out.push({
      day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      apy: Number(v.toFixed(2)),
    });
  }
  return out;
}

export function ApyChart() {
  const data = useMemo(() => mockApy(), []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-base">APY (simulated)</CardTitle>
            <CardDescription className="text-xs">
              Rolling 7-day window derived from share-price deltas.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-semibold tabular-nums">
              {data[data.length - 1]?.apy.toFixed(2)}%
            </div>
            <div className="text-[11px] text-muted-foreground">estimated annualised</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-40 w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
      </CardContent>
    </Card>
  );
}
