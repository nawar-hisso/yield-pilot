"use client";

import { CheckCircle2, Loader2, Radio, XCircle, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TxState } from "../../hooks/useTxState";

const MAP: Record<
  TxState,
  { label: string; icon: LucideIcon; className: string; spin?: boolean }
> = {
  idle: {
    label: "Ready",
    icon: Radio,
    className: "border-[color:var(--color-border)] bg-[color:var(--color-card)] text-muted-foreground",
  },
  signing: {
    label: "Confirm in wallet",
    icon: Wallet,
    className: "border-[color:var(--color-accent-glow)] bg-[color:var(--color-accent-glow)] text-[color:var(--color-accent)]",
  },
  broadcasting: {
    label: "Broadcasting",
    icon: Loader2,
    className: "border-[color:var(--color-accent-glow)] bg-[color:var(--color-accent-glow)] text-[color:var(--color-accent)]",
    spin: true,
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className: "border-success/40 bg-success/15 text-success",
  },
  error: {
    label: "Failed",
    icon: XCircle,
    className: "border-destructive/40 bg-destructive/15 text-destructive",
  },
};

export function TxStatusPill({
  state,
  className,
  override,
}: {
  state: TxState;
  className?: string;
  /** Optional label override — e.g. "Approving USDC…" for a two-step flow. */
  override?: string;
}) {
  if (state === "idle") return null;
  const entry = MAP[state];
  const Icon = entry.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-fast ease-out-quart",
        entry.className,
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", entry.spin && "animate-spin")} strokeWidth={2} />
      <span>{override ?? entry.label}</span>
    </div>
  );
}
