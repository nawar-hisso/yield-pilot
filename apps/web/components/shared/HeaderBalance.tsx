"use client";

import { formatUnits } from "viem";
import { Coins } from "lucide-react";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { USDC_DECIMALS } from "../../lib/contracts";
import { useWallet } from "../../hooks/useWallet";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function HeaderBalance() {
  const wallet = useWallet();
  const { data, isLoading } = useUsdcBalance();

  if (!wallet.isConnected) return null;

  const pretty =
    data !== undefined
      ? Number(formatUnits(data, USDC_DECIMALS)).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "—";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-card-muted px-3 py-1.5 text-sm">
          <Coins className="h-3.5 w-3.5 text-accent" />
          {isLoading ? <Skeleton className="h-4 w-12" /> : <span className="font-mono font-medium tabular-nums">{pretty}</span>}
          <span className="text-xs text-muted-foreground">mUSDC</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Your deposit asset balance. Use /faucet to top up.</TooltipContent>
    </Tooltip>
  );
}
