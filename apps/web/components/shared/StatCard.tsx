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
  accent?: "cyan" | "violet" | "fuchsia" | "lime";
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-5 transition-colors hover:bg-card-muted",
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
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold font-display leading-none tracking-tight">
            {loading ? <Skeleton className="h-7 w-24" /> : value}
          </div>
          {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
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
