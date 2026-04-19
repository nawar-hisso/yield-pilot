"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatUnits, type Address } from "viem";
import { useWriteContract } from "wagmi";
import { MockAaveAbi, MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { CheckCircle2, Flame, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { publicClient } from "../../lib/viem";
import { contractsFor, USDC_DECIMALS } from "../../lib/contracts";
import { useWallet } from "../../hooks/useWallet";

const FAUCET_AMOUNT_RAW = 1_000_000_000n; // 1,000 mUSDC @ 6 decimals.

function fmtUsdc(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  return Number(formatUnits(raw, USDC_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

interface AdminData {
  buffer: bigint; // USDC literally held by MockAave
  owed: bigint;   // What MockAave tells the vault it's worth (principal + accrued)
}

async function loadAdminData(vault: Address, usdc: Address, aave: Address): Promise<AdminData> {
  const [buffer, owed] = await Promise.all([
    publicClient.readContract({
      address: usdc,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [aave],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: aave,
      abi: MockAaveAbi,
      functionName: "getBalance",
      args: [usdc, vault],
    }) as Promise<bigint>,
  ]);
  return { buffer, owed };
}

export function AdminPanel() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault, usdc, aave } = contractsFor(chainId);

  const { data, mutate } = useSWR<AdminData | null>(
    vault && usdc && aave ? ["admin-data", vault, usdc, aave] : null,
    () => loadAdminData(vault!, usdc!, aave!),
    { refreshInterval: 10_000 },
  );

  if (!vault || !usdc || !aave) return null;

  return (
    <section className="space-y-4">
      <header className="max-w-2xl">
        <h2 className="text-xl font-semibold font-display">Mock controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below is a dev knob. In a real vault these jobs run automatically (or via a
          keeper bot). Because this is a demo running on mock contracts, we expose them so you
          can make the dashboard move.
        </p>
      </header>

      <TopUpAaveCard
        usdc={usdc}
        aave={aave}
        data={data}
        walletType={wallet.walletType}
        onDone={() => mutate()}
      />
    </section>
  );
}

// ─── Top up MockAave buffer ───────────────────────────────────────────────────

function TopUpAaveCard({
  usdc,
  aave,
  data,
  walletType,
  onDone,
}: {
  usdc: Address;
  aave: Address;
  data: AdminData | null | undefined;
  walletType: "eoa" | "passkey" | null;
  onDone: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  const buffer = data?.buffer ?? 0n;
  const owed = data?.owed ?? 0n;
  const deficit = owed > buffer ? owed - buffer : 0n;
  const healthy = deficit === 0n;

  const canSubmit = walletType === "eoa" && !busy;

  async function onClick() {
    if (!canSubmit) return;
    setBusy(true);
    toast.loading("Claiming 1,000 mUSDC from the faucet…", { id: "topup" });
    try {
      const faucetTx = await writeContractAsync({
        address: usdc,
        abi: MockUsdcAbi,
        functionName: "faucet",
      });
      await publicClient.waitForTransactionReceipt({ hash: faucetTx });

      toast.loading("Sending it to MockAave…", { id: "topup" });
      const xferTx = await writeContractAsync({
        address: usdc,
        abi: MockUsdcAbi,
        functionName: "transfer",
        args: [aave, FAUCET_AMOUNT_RAW],
      });
      await publicClient.waitForTransactionReceipt({ hash: xferTx });

      toast.success("MockAave topped up with 1,000 mUSDC", { id: "topup" });
      onDone();
    } catch (err) {
      toast.error("Top-up failed", { id: "topup", description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Flame className="h-4 w-4 text-[color:var(--color-gold)]" /> Top up MockAave&apos;s reserve
        </CardTitle>
        <CardDescription className="pt-1 leading-relaxed">
          MockAave promises a generous APY but doesn&apos;t actually print new USDC. It just
          remembers that it <em>owes</em> more than it was handed. If the interest it&apos;s racked
          up ever exceeds the USDC sitting in its account, withdrawals fail with a
          &quot;balance too low&quot; error. This button claims 1,000 mUSDC from the public faucet
          and forwards it to MockAave so the reserve stays ahead of the debt. Safe to press any
          time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card-muted px-4 py-3 text-sm">
          <Stat label="MockAave USDC on hand" value={`$${fmtUsdc(buffer)}`} strong />
          <Stat label="MockAave owes the vault" value={`$${fmtUsdc(owed)}`} />
          <div className="col-span-2 pt-2 border-t border-border/50">
            {healthy ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Buffer is healthy — {`$${fmtUsdc(buffer - owed)}`} headroom
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Short by ${fmtUsdc(deficit)} — top up
                before large withdrawals
              </span>
            )}
          </div>
        </div>

        {walletType !== "eoa" ? (
          <Note
            icon={Info}
            tone="info"
            text="This action is EOA-only for now (MetaMask etc.). Passkey smart accounts can't run the two-step faucet → transfer flow directly yet."
          />
        ) : null}

        <Button onClick={onClick} disabled={!canSubmit} className="w-full">
          {busy ? "Working…" : "Faucet 1,000 mUSDC → MockAave"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono tabular-nums ${strong ? "text-lg font-semibold" : "text-base"}`}>
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Note({
  icon: Icon,
  tone,
  text,
}: {
  icon: typeof Info;
  tone: "info" | "warn" | "ok";
  text: string;
}) {
  const color =
    tone === "warn"
      ? "border-warning/30 bg-warning/5 text-warning"
      : tone === "ok"
        ? "border-success/30 bg-success/5 text-success"
        : "border-accent/30 bg-accent/5 text-accent";
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${color}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}
