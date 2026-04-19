"use client";

import { useEffect, useRef } from "react";
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
  const heroRef = useRef<HTMLDivElement>(null);

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
          value="—"
          hint="History arrives with the subgraph"
          icon={TrendingUp}
          loading={isLoading}
          accent="violet"
        />
        <StatCard
          label="APY"
          value="—"
          hint="Arrives with the subgraph"
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
