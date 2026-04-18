"use client";

import { Button } from "../ui/button";
import { useFaucet } from "../../hooks/useFaucet";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { useWallet } from "../../hooks/useWallet";
import { formatUnits } from "viem";
import { USDC_DECIMALS } from "../../lib/contracts";

export function FaucetButton() {
  const wallet = useWallet();
  const { claim, isPending, isConfirming, isSuccess } = useFaucet();
  const { data: balance, mutate } = useUsdcBalance();

  if (!wallet.isConnected) return null;
  if (wallet.walletType === "passkey") return null; // needs gas, unsupported locally

  const pretty = balance !== undefined
    ? `${Number(formatUnits(balance, USDC_DECIMALS)).toLocaleString()} mUSDC`
    : "—";

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3">
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Your mUSDC balance</div>
        <div className="mt-1 font-medium">{pretty}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending || isConfirming}
        onClick={async () => {
          await claim();
          await mutate();
        }}
      >
        {isPending ? "Confirming…" : isConfirming ? "Mining…" : isSuccess ? "+1,000 claimed" : "Claim 1,000 mUSDC"}
      </Button>
    </div>
  );
}
