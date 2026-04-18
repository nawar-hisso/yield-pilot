"use client";

import { Coins } from "lucide-react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { Button } from "../ui/button";
import { TxStatusPill } from "../shared/TxStatusPill";
import { useFaucet } from "../../hooks/useFaucet";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { useWallet } from "../../hooks/useWallet";
import { USDC_DECIMALS } from "../../lib/contracts";

export function FaucetButton() {
  const wallet = useWallet();
  const { claim, isPending, isConfirming, isSuccess, txState } = useFaucet();
  const { data: balance, mutate } = useUsdcBalance();

  if (!wallet.isConnected) return null;
  if (wallet.walletType === "passkey") return null; // needs gas, unsupported locally

  const pretty = balance !== undefined
    ? `${Number(formatUnits(balance, USDC_DECIMALS)).toLocaleString()} mUSDC`
    : "—";

  return (
    <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-grad-card px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-card text-accent">
          <Coins className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Your mUSDC balance
          </div>
          <div className="mt-0.5 font-mono tabular-nums text-lg font-semibold">{pretty}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TxStatusPill state={txState} />
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || isConfirming}
          onClick={async () => {
            toast.loading("Claiming 1,000 mUSDC…", { id: "faucet" });
            try {
              await claim();
              await mutate();
              toast.success("Claimed 1,000 mUSDC", { id: "faucet" });
            } catch (err) {
              toast.error("Faucet failed", { id: "faucet", description: (err as Error).message });
            }
          }}
        >
          {isPending ? "Confirming…" : isConfirming ? "Mining…" : isSuccess ? "+1,000 claimed" : "Claim 1,000 mUSDC"}
        </Button>
      </div>
    </div>
  );
}
