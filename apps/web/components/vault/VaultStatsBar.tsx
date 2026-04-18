"use client";

import { formatUnits } from "viem";
import { USDC_DECIMALS } from "../../lib/contracts";
import { useVaultPosition } from "../../hooks/useVaultPosition";

function formatUsdc(v: bigint | undefined) {
  if (v === undefined) return "—";
  const str = formatUnits(v, USDC_DECIMALS);
  const num = Number(str);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(num) + " USDC";
}

export function VaultStatsBar() {
  const { data, isLoading } = useVaultPosition();

  const tvl = data?.totalAssets;
  const userShares = data?.userShares;
  const userAssets = data?.userAssets;
  const sharesPerUsdc = data?.sharesPerUsdc;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="TVL"            value={isLoading ? "…" : formatUsdc(tvl)} />
      <Stat label="Share Price"    value={sharesPerUsdc && sharesPerUsdc > 0n
        ? `1 USDC = ${formatUnits(sharesPerUsdc, 0)} shares`
        : isLoading ? "…" : "—"} />
      <Stat label="My Shares"      value={userShares !== undefined ? userShares.toString() : "—"} />
      <Stat label="My Position"    value={formatUsdc(userAssets)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-[border-color,background] duration-fast ease-out-quart hover:border-[color:var(--color-border-glow)]">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-mono tabular-nums text-xl font-semibold">{value}</div>
    </div>
  );
}
