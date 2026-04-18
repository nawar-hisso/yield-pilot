"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { USDC_DECIMALS } from "../../lib/contracts";
import { useWallet } from "../../hooks/useWallet";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { useUsdcAllowance } from "../../hooks/useUsdcAllowance";
import { useApprove } from "../../hooks/useApprove";
import { useDeposit } from "../../hooks/useDeposit";
import { useVaultPosition } from "../../hooks/useVaultPosition";

export function DepositForm() {
  const wallet = useWallet();
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: balance, mutate: refetchBalance } = useUsdcBalance();
  const { data: allowance, mutate: refetchAllowance } = useUsdcAllowance();
  const { approve, isPending: approving, isConfirming: approveConfirming } = useApprove();
  const { deposit, isPending: depositing, isConfirming: depositConfirming } = useDeposit();
  const { mutate: refetchPosition } = useVaultPosition();

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return parseUnits(raw, USDC_DECIMALS);
    } catch {
      return null;
    }
  }, [raw]);

  const needsApproval = parsed !== null && (allowance ?? 0n) < parsed;
  const exceedsBalance = parsed !== null && balance !== undefined && parsed > balance;
  const busy = approving || approveConfirming || depositing || depositConfirming;

  const disabled =
    !wallet.isConnected || parsed === null || parsed === 0n || exceedsBalance || busy;

  async function onClick() {
    if (parsed === null) return;
    setErrorMsg(null);
    try {
      if (needsApproval) {
        setStatus("Approving USDC…");
        await approve(parsed);
        await refetchAllowance();
      }
      setStatus("Depositing…");
      await deposit(parsed);
      setStatus("Deposited ✓");
      setRaw("");
      await Promise.all([refetchBalance(), refetchAllowance(), refetchPosition()]);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Amount</span>
        <span>
          Balance: {balance === undefined ? "—" : Number(formatUnits(balance, USDC_DECIMALS)).toLocaleString()} mUSDC
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
          onClick={() => {
            if (balance !== undefined) setRaw(formatUnits(balance, USDC_DECIMALS));
          }}
          disabled={balance === undefined || balance === 0n}
        >
          Max
        </Button>
      </div>
      <Button className="w-full" disabled={disabled} onClick={onClick}>
        {!wallet.isConnected
          ? "Connect wallet"
          : exceedsBalance
            ? "Insufficient balance"
            : busy
              ? status ?? "Working…"
              : needsApproval
                ? "Approve + Deposit"
                : "Deposit"}
      </Button>
      {status && !errorMsg ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      {errorMsg ? <p className="text-xs text-destructive break-words">{errorMsg}</p> : null}
    </div>
  );
}
