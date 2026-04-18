"use client";

import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

export interface StatCardProps {
  label: string;
  value: string | React.ReactNode;
  /** Optional sub-value shown beneath the main value (e.g. USD conversion). */
  hint?: string;
  icon?: LucideIcon;
  change?: { value: string; direction: "up" | "down" | "flat" };
  loading?: boolean;
  accent?: "cyan" | "violet" | "fuchsia" | "lime" | "gold";
  className?: string;
}

const accentMap = {
  cyan: { bg: "from-accent/25 via-accent/5", icon: "text-accent", border: "border-accent/30" },
  violet: {
    bg: "from-brand-violet/25 via-brand-violet/5",
    icon: "text-brand-violet",
    border: "border-brand-violet/30",
  },
  fuchsia: {
    bg: "from-brand-fuchsia/25 via-brand-fuchsia/5",
    icon: "text-brand-fuchsia",
    border: "border-brand-fuchsia/30",
  },
  lime: {
    bg: "from-brand-lime/20 via-brand-lime/5",
    icon: "text-brand-lime",
    border: "border-brand-lime/30",
  },
  gold: {
    bg: "from-[color:var(--color-gold)]/25 via-[color:var(--color-gold)]/5",
    icon: "text-[color:var(--color-gold)]",
    border: "border-[color:var(--color-gold)]/30",
  },
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  change,
  loading,
  accent = "cyan",
  className,
}: StatCardProps) {
  const a = accentMap[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-5",
        "transition-[border-color,background] duration-fast ease-out-quart",
        "hover:bg-card-muted hover:border-[color:var(--color-border-glow)]",
        a.border,
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br to-transparent opacity-60",
          a.bg,
        )}
      />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-3)]">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold leading-none tracking-tight">
            {loading ? <Skeleton className="h-7 w-24" /> : value}
          </div>
          {hint ? <div className="mt-2 text-xs font-normal text-[color:var(--color-text-2)]">{hint}</div> : null}
          {change ? (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                change.direction === "up" && "bg-success/15 text-success",
                change.direction === "down" && "bg-destructive/15 text-destructive",
                change.direction === "flat" && "bg-muted text-muted-foreground",
              )}
            >
              <span aria-hidden>
                {change.direction === "up" ? "▲" : change.direction === "down" ? "▼" : "·"}
              </span>
              {change.value}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border bg-background/40 backdrop-blur",
              a.border,
              a.icon,
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
