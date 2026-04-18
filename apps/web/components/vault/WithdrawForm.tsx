"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { USDC_DECIMALS } from "../../lib/contracts";
import { useWallet } from "../../hooks/useWallet";
import { useWithdraw } from "../../hooks/useWithdraw";
import { useVaultPosition } from "../../hooks/useVaultPosition";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";

export function WithdrawForm() {
  const wallet = useWallet();
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: position, mutate: refetchPosition } = useVaultPosition();
  const { mutate: refetchBalance } = useUsdcBalance();
  const { withdraw, isPending, isConfirming } = useWithdraw();

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return parseUnits(raw, USDC_DECIMALS);
    } catch {
      return null;
    }
  }, [raw]);

  const maxAssets = position?.userAssets ?? 0n;
  const exceeds = parsed !== null && parsed > maxAssets;
  const busy = isPending || isConfirming;
  const disabled = !wallet.isConnected || parsed === null || parsed === 0n || exceeds || busy;

  async function onClick() {
    if (parsed === null) return;
    setErrorMsg(null);
    try {
      setStatus("Withdrawing…");
      await withdraw(parsed);
      setStatus("Withdrew ✓");
      setRaw("");
      await Promise.all([refetchPosition(), refetchBalance()]);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Withdraw</span>
        <span>
          Available: {Number(formatUnits(maxAssets, USDC_DECIMALS)).toLocaleString()} mUSDC
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          placeholder="0.00"
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
          className="text-lg"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRaw(formatUnits(maxAssets, USDC_DECIMALS))}
          disabled={maxAssets === 0n}
        >
          Max
        </Button>
      </div>
      <Button className="w-full" disabled={disabled} onClick={onClick}>
        {!wallet.isConnected ? "Connect wallet" : exceeds ? "Exceeds position" : busy ? status ?? "Working…" : "Withdraw"}
      </Button>
      {status && !errorMsg ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      {errorMsg ? <p className="text-xs text-destructive break-words">{errorMsg}</p> : null}
    </div>
  );
}
