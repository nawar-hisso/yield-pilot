"use client";

import { Activity, Coins, Percent, TrendingUp } from "lucide-react";
import { formatUnits } from "viem";
import { StatCard } from "../shared/StatCard";
import { EmptyState } from "../shared/EmptyState";
import { NumberTicker } from "../shared/NumberTicker";
import { TvlChart } from "./TvlChart";
import { ApyChart } from "./ApyChart";
import { useRealtime } from "../../hooks/useRealtime";
import { useVaultPosition } from "../../hooks/useVaultPosition";
import { useWallet } from "../../hooks/useWallet";
import { Button } from "../ui/button";
import { USDC_DECIMALS } from "../../lib/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

function fmt(v: bigint | undefined) {
  if (v === undefined) return "—";
  const num = Number(formatUnits(v, USDC_DECIMALS));
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function num(v: bigint | undefined): number {
  if (v === undefined) return 0;
  return Number(formatUnits(v, USDC_DECIMALS));
}

export function DashboardOverview() {
  const wallet = useWallet();
  const { data: position, isLoading } = useVaultPosition();
  const { last } = useRealtime();

  return (
    <section className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border-grad bg-grad-card p-8">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            {wallet.isConnected ? "Your Yield" : "Welcome"}
          </div>
          <h1 className="text-3xl lg:text-5xl font-semibold font-display leading-tight">
            {wallet.isConnected ? (
              <>
                <NumberTicker
                  value={num(position?.userAssets)}
                  prefix="$"
                  className="text-grad"
                />
                <span className="text-muted-foreground"> deployed</span>
              </>
            ) : (
              <span>Deposit. Delegate. <span className="text-grad">Earn.</span></span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg">
            {wallet.isConnected
              ? "Your position updates in real-time from on-chain events. Use the vault to top up or withdraw."
          </p>
          {!wallet.isConnected ? (
            <div className="pt-3 flex gap-3">
              <Button size="lg" className="shadow-glow" onClick={wallet.openChooser}>
                Get started
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="/vault">Explore vault</a>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Portfolio Value"
          value={<NumberTicker value={num(position?.userAssets)} prefix="$" />}
          hint="USDC value of your vault shares"
          icon={Coins}
          loading={isLoading}
          accent="cyan"
        />
        <StatCard
          label="P&L"
          value="—"
          hint="History arrives with the subgraph"
          icon={TrendingUp}
          loading={isLoading}
          accent="violet"
        />
        <StatCard
          label="APY"
          value={<NumberTicker value={4.62} suffix="%" />}
          hint="Simulated, 7-day rolling"
          icon={Percent}
          loading={isLoading}
          accent="fuchsia"
          change={{ value: "0.18%", direction: "up" }}
        />
        <StatCard
          label="TVL"
          value={<NumberTicker value={num(position?.totalAssets)} prefix="$" />}
          hint="Across all depositors"
          icon={Activity}
          loading={isLoading}
          accent="lime"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TvlChart />
        <ApyChart />
      </div>

      {/* Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display">Live activity</CardTitle>
          <span className="text-xs text-muted-foreground">WebSocket · real-time</span>
        </CardHeader>
        <CardContent>
          {last ? (
            <div className="rounded-md border border-border bg-card-muted px-4 py-3 text-sm">
              <span className="text-accent font-medium">{last.type}</span> received at{" "}
              {new Date().toLocaleTimeString()}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title={wallet.isConnected ? "No activity yet" : "Connect to stream events"}
              description={
                wallet.isConnected
                  : "Real-time on-chain events stream via the apps/api WebSocket once you're connected."
              }
              action={
                !wallet.isConnected ? <Button onClick={wallet.openChooser}>Connect</Button> : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
