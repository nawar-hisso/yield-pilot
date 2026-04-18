"use client";

import { Dot } from "lucide-react";
import { cn } from "../../lib/utils";

const CHAIN_NAME: Record<number, string> = {
  31337: "Hardhat",
  11155111: "Sepolia",
  84532: "Base Sepolia",
};

export function NetworkBadge() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const name = CHAIN_NAME[chainId] ?? `chain #${chainId}`;
  const isTestnet = chainId !== 1 && chainId !== 8453;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        isTestnet ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success",
      )}
    >
      <Dot className="h-4 w-4 -ml-1 animate-pulse" />
      <span>{name}</span>
      {isTestnet ? <span className="text-warning/80">· testnet</span> : null}
    </div>
  );
}
