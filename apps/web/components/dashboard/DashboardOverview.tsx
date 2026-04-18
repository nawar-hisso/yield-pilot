"use client";

import { useRealtime } from "../../hooks/useRealtime";
import { useVault } from "../../hooks/useVault";

export function DashboardOverview() {
  const vault = useVault();
  const realtime = useRealtime();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Portfolio value, P&amp;L, and live strategy activity.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Portfolio value" value={vault.data ? String(vault.data.totalAssets) : "—"} />
        <Stat label="P&L" value="—" hint="Filled from subgraph in Phase 3" />
        <Stat label="APY" value="—" hint="Filled from share-price history in Phase 3" />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-medium mb-2">Live activity</h2>
        <p className="text-sm text-muted-foreground">
          {realtime.last
            ? `Last event: ${realtime.last.type} @ ${new Date().toLocaleTimeString()}`
            : "Connect your wallet to start receiving real-time deposit / withdraw events from apps/api."}
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
