"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { short } from "../../lib/utils";
import { cn } from "../../lib/utils";

export interface AddressPillProps {
  address: string | undefined | null;
  /** Character counts for the truncation. Mandate default is 4/4 (0x1234…5678). */
  left?: number;
  right?: number;
  className?: string;
  /** When true, hides the copy icon and disables the button — use inside larger clickable rows. */
  readOnly?: boolean;
}

/**
 * Mandate-compliant address pill: truncated in mono font, click to copy,
 * toast confirmation, keyboard-accessible.
 */
export function AddressPill({
  address,
  left = 4,
  right = 4,
  className,
  readOnly = false,
}: AddressPillProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!address || readOnly) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  if (!address) return null;

  const base =
    "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-2 py-0.5 font-mono text-[12px] text-text1 transition-colors duration-fast ease-out-quart";

  if (readOnly) {
    return (
      <span className={cn(base, className)} title={address}>
        {short(address, left, right)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy address ${address}`}
      className={cn(
        base,
        "cursor-pointer hover:bg-[color:var(--color-card-hover)] hover:border-[color:var(--color-border-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]",
        className,
      )}
    >
      <span>{short(address, left, right)}</span>
      {copied ? (
        <Check className="h-3 w-3 text-success" strokeWidth={2} />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
      )}
    </button>
  );
}
