"use client";

import { useEffect, useMemo, useRef } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, Coins, Percent, TrendingUp } from "lucide-react";
import { formatUnits } from "viem";
import useSWR from "swr";
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
import {
  computeApyFromSharePrice,
  fetchDailyTvl,
  fetchRecentActivity,
  fetchSharePriceSeries,
  fetchUserFlows,
  type DailyTvlPoint,
  type SharePricePoint,
  type UserFlowSummary,
  type VaultActivityEvent,
} from "../../lib/subgraphQueries";
import { short } from "../../lib/utils";

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
  const { data: activity } = useSWR<VaultActivityEvent[] | null>(
    "recent-activity",
    () => fetchRecentActivity(10),
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );
  const { data: flows } = useSWR<UserFlowSummary | null>(
    wallet.address ? ["user-flows", wallet.address] : null,
    ([, addr]) => fetchUserFlows(addr as `0x${string}`),
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );
  const { data: sharePriceSeries } = useSWR<SharePricePoint[] | null>(
    "share-price-series",
    () => fetchSharePriceSeries(1000),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const { data: dailyTvl } = useSWR<DailyTvlPoint[] | null>(
    "tvl-daily-30",
    () => fetchDailyTvl(30),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  /** Prefer share-price APY (true realised yield). Fall back to a TVL-inflow
   *  proxy when the subgraph hasn't indexed SharePriceSnapshot yet — better
   *  than showing "—" during the transition window. `source` drives the
   *  hint text so users know which path they're seeing; `spanSeconds` lets
   *  us label early-window readings as noisy. */
  const { value: apy, source: apySource, spanSeconds } = useMemo(() => {
    const sp = sharePriceSeries ? computeApyFromSharePrice(sharePriceSeries) : null;
    if (sp !== null) {
      return { value: sp.value, source: "share-price" as const, spanSeconds: sp.spanSeconds };
    }
    if (dailyTvl && dailyTvl.length >= 2) {
      const first = dailyTvl[0]!;
      const last = dailyTvl[dailyTvl.length - 1]!;
      if (first.tvlUsdc > 0n && last.day > first.day) {
        const growth = Number((last.tvlUsdc - first.tvlUsdc) * 10_000n / first.tvlUsdc) / 10_000;
        const years = (last.day - first.day) / 31_557_600;
        if (years > 0) {
          const proxy = Math.max(0, Math.min(25, (growth / years) * 100));
          return {
            value: Number(proxy.toFixed(2)),
            source: "tvl-inflow" as const,
            spanSeconds: last.day - first.day,
          };
        }
      }
    }
    return { value: null as number | null, source: "none" as const, spanSeconds: 0 };
  }, [sharePriceSeries, dailyTvl]);
  const heroRef = useRef<HTMLDivElement>(null);

  // P&L = current position value − cost basis (deposits − withdrawals).
  // Positive = profit, negative = drawdown. We require BOTH (a) subgraph to
  // have returned user flows AND (b) a non-zero position or cost basis before
  // rendering — an empty position with no events just reads "—".
  const pnl = useMemo(() => {
    if (!flows || !position) return null;
    if (flows.costBasis === 0n && position.userAssets === 0n) return null;
    const current = position.userAssets;
    const basis = flows.costBasis;
    // Absolute P&L can be negative; viem/bigint handles it as long as we
    // keep the subtraction unsigned-aware.
    const absNumerator = current >= basis ? current - basis : basis - current;
    const sign = current >= basis ? 1 : -1;
    const absUsd = Number(formatUnits(absNumerator, USDC_DECIMALS)) * sign;
    const pctDenominator = basis === 0n ? 1n : basis;
    const pct = basis === 0n
      ? 0
      : Number((current - basis) * 10_000n / pctDenominator) / 100;
    return { absUsd, pct };
  }, [flows, position]);

  // priority; fall back to the subgraph-polled activity feed. Always show the
  // most recent at the top.
  const feed = useMemo<VaultActivityEvent[]>(() => {
    const subgraphFeed = activity ?? [];
    if (last && last.type === "vault.event") {
      const wsEvent: VaultActivityEvent = {
        kind: last.payload.kind === "Deposit" ? "Deposit" : "Withdraw",
        assets: BigInt(last.payload.assets ?? "0"),
        ts: last.payload.timestamp,
        user: last.payload.user,
        txHash: last.payload.txHash,
      };
      return [wsEvent, ...subgraphFeed.filter((e) => e.txHash !== wsEvent.txHash)].slice(0, 10);
    }
    return subgraphFeed;
  }, [activity, last]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !heroRef.current) return;

    let ctx: { revert: () => void } | null = null;
    let cancelled = false;

    // Dynamic import — keeps GSAP out of SSR + shrinks initial chunk on reduced-motion bailout.
    void (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !heroRef.current) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const words = gsap.utils.toArray<HTMLElement>("[data-hero-word]");
        gsap.fromTo(
          words,
          { y: 32, opacity: 0, rotateX: -20 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            stagger: 0.08,
            duration: 0.9,
            ease: "power3.out",
          },
        );

        if (heroRef.current) {
          gsap.to(heroRef.current, {
            backgroundPositionY: "30%",
            ease: "none",
            scrollTrigger: {
              trigger: heroRef.current,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      }, heroRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  const heroHeadline = wallet.isConnected
    ? ["Your", "position"]
    : ["Deposit.", "Delegate.", "Earn."];

  return (
    <section className="space-y-6">
      {/* Hero */}
      <div
        ref={heroRef}
        className="relative overflow-hidden rounded-xl border-grad bg-grad-card p-8"
        style={{ backgroundSize: "cover", backgroundPositionY: "0%" }}
      >
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-accent">
            {wallet.isConnected ? "Your Position" : "Welcome"}
          </div>
          <h1 className="text-3xl lg:text-5xl leading-tight [perspective:800px]">
            {wallet.isConnected ? (
              <>
                <span data-hero-word className="inline-block font-extrabold">
                  <NumberTicker
                    value={num(position?.userAssets)}
                    prefix="$"
                    className="text-grad"
                  />
                </span>{" "}
                <span data-hero-word className="inline-block font-light text-[color:var(--color-text-2)]">
                  deployed
                </span>
              </>
            ) : (
              heroHeadline.map((word, i) => {
                const accented = i === heroHeadline.length - 1;
                return (
                  <span
                    key={word + i}
                    data-hero-word
                    className={`inline-block font-extrabold ${accented ? "text-grad" : ""} ${i > 0 ? "ml-2" : ""}`}
                  >
                    {word}
                  </span>
                );
              })
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
          value={
            pnl === null ? (
              "—"
            ) : (
              <NumberTicker
                value={pnl.absUsd}
                prefix={pnl.absUsd >= 0 ? "+$" : "-$"}
                format={(v) => Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                className={pnl.absUsd >= 0 ? "text-success" : "text-destructive"}
              />
            )
          }
          hint={
            pnl === null
              ? "No positions yet"
              : pnl.absUsd === 0
                ? "Share price flat — no yield accrued yet"
                : `vs. $${Number(formatUnits(flows!.costBasis, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })} cost basis`
          }
          icon={TrendingUp}
          loading={isLoading}
          accent="violet"
          change={
            pnl !== null && flows!.costBasis > 0n
              ? {
                  value: `${Math.abs(pnl.pct).toFixed(2)}%`,
                  direction: pnl.pct >= 0 ? "up" : "down",
                }
              : undefined
          }
        />
        <StatCard
          label="APY"
          value={
            apy === null ? (
              "—"
            ) : (
              <NumberTicker
                value={apy}
                suffix="%"
                format={(v) => v.toFixed(2)}
                className="text-[color:var(--color-gold)]"
              />
            )
          }
          hint={
            apy === null
              ? "Waiting for 2+ snapshots"
              : apySource === "share-price"
                ? spanSeconds < 3600
                  ? `Early sample (${Math.max(1, Math.round(spanSeconds / 60))}m) — will stabilise with more txns`
                  : "Realised share-price growth"
                : "Inflow proxy · redeploy subgraph for realised APY"
          }
          icon={Percent}
          loading={isLoading}
          accent="gold"
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
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Subgraph · 30s poll
          </span>
        </CardHeader>
        <CardContent>
          {feed.length > 0 ? (
            <ul className="divide-y divide-border">
              {feed.map((e) => {
                const isDeposit = e.kind === "Deposit";
                const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
                const amount = Number(formatUnits(e.assets, USDC_DECIMALS)).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 2 },
                );
                return (
                  <li
                    key={`${e.txHash}-${e.kind}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        aria-hidden
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                          isDeposit
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-warning/30 bg-warning/10 text-warning"
                        }`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {e.kind} <span className="font-mono tabular-nums">{amount}</span>{" "}
                          <span className="text-muted-foreground">mUSDC</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{short(e.user)}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {new Date(e.ts * 1000).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Activity}
              title={wallet.isConnected ? "No activity yet" : "Connect to stream events"}
              description={
                wallet.isConnected
                  : "Deposits and withdrawals appear here as soon as the subgraph indexes them."
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
