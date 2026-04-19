"use client";

import { useState } from "react";
import { KeyRound, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { usePairedDevices, type PairedKey } from "../../hooks/usePairedDevices";
import { useWallet } from "../../hooks/useWallet";
import { PairDeviceDialog } from "../wallet/PairDeviceDialog";

function fmtDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PairedDevicesCard() {
  const wallet = useWallet();
  const { data, isLoading, error, mutate } = usePairedDevices();
  const [pairOpen, setPairOpen] = useState(false);

  if (wallet.walletType !== "passkey") return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Paired devices
            </CardTitle>
            <CardDescription>
              Every passkey authorized to sign for this smart account. Read from on-chain.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPairOpen(true)}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Pair device
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-2)]">
              Account not deployed yet — the first passkey registers on-chain when the account
              is created (first UserOp or explicit factory call on Sepolia).
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((k) => (
                <DeviceRow key={k.credIdHash} k={k} onChanged={() => void mutate()} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <PairDeviceDialog open={pairOpen} onOpenChange={setPairOpen} />
    </>
  );
}

function DeviceRow({ k, onChanged }: { k: PairedKey; onChanged: () => void }) {
  const [revoking, setRevoking] = useState(false);

  async function revoke() {
    setRevoking(true);
    try {
      // TODO(sepolia): signs + submits revokeKey UserOp once the bundler is wired.
      throw new Error(
        "Revoke requires Sepolia — the Pimlico bundler doesn't serve localhost.",
      );
    } catch (err) {
      toast.error("Revoke failed", { description: (err as Error).message });
    } finally {
      setRevoking(false);
      onChanged();
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate">
            {k.nickname || "(unnamed)"}
          </div>
          {k.isPrimary ? <Badge variant="accent">Primary</Badge> : null}
          {!k.active ? <Badge variant="outline">Revoked</Badge> : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[color:var(--color-text-3)] truncate">
          {k.credIdHash.slice(0, 18)}…{k.credIdHash.slice(-6)} · added {fmtDate(k.addedAt)}
        </div>
      </div>
      {k.active && !k.isPrimary ? (
        <Button size="sm" variant="outline" disabled={revoking} onClick={revoke}>
          {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
        </Button>
      ) : null}
    </li>
  );
}
