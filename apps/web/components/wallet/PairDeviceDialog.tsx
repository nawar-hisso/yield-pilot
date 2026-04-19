"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useWallet } from "../../hooks/useWallet";
import { useAddAuthorizedKey } from "../../hooks/useAddAuthorizedKey";
import type { Hex } from "viem";

interface PairProposal {
  credIdHash: Hex;
  pubKeyX: Hex;
  pubKeyY: Hex;
  credentialId: string;
  nickname: string;
}

function randomNonce(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function apiOrigin(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return apiUrl.replace(/^http/, "ws");
}

export function PairDeviceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const wallet = useWallet();
  const [nonce] = useState(() => randomNonce());
  const [status, setStatus] = useState<"waiting" | "received" | "approving" | "paired" | "error">("waiting");
  const [proposal, setProposal] = useState<PairProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { authorize, isSigning, isBroadcasting } = useAddAuthorizedKey();

  const pairUrl = useMemo(() => {
    if (typeof window === "undefined" || !wallet.address) return "";
    const base = `${window.location.origin}/?pair=${nonce}&account=${wallet.address}`;
    return base;
  }, [nonce, wallet.address]);

  useEffect(() => {
    if (!open) return;
    const ws = new WebSocket(`${apiOrigin()}/ws/pair`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "pair:join", nonce, role: "host" }));
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "pair:propose") {
          setProposal(m as PairProposal);
          setStatus("received");
        }
      } catch {
        // ignore malformed
      }
    };
    ws.onerror = () => setError("WebSocket error");
    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [open, nonce]);

  const approve = useCallback(async () => {
    if (!proposal) return;
    setStatus("approving");
    try {
      await authorize({
        credIdHash: proposal.credIdHash,
        pubKeyX: proposal.pubKeyX,
        pubKeyY: proposal.pubKeyY,
        nickname: proposal.nickname,
      });
      wsRef.current?.send(JSON.stringify({ type: "pair:complete", accountAddress: wallet.address }));
      setStatus("paired");
      toast.success("Device paired — the other browser can now sign for this account");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [proposal, authorize, wallet.address]);

  async function copyUrl() {
    if (!pairUrl) return;
    await navigator.clipboard.writeText(pairUrl);
    setCopied(true);
    toast.success("Pairing link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Pair another device</DialogTitle>
          <DialogDescription>
            Scan or paste this link on your new device. After it registers a passkey you&apos;ll
            approve on this browser to authorize it for your account.
          </DialogDescription>
        </DialogHeader>

        {status === "waiting" ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border border-border bg-white p-4">
              {pairUrl ? (
                <QRCodeSVG value={pairUrl} size={220} bgColor="#ffffff" fgColor="#120611" />
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Input value={pairUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyUrl} aria-label="Copy pair URL">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Waiting for the other device to join… <Loader2 className="inline h-3 w-3 animate-spin" />
            </p>
          </div>
        ) : status === "received" && proposal ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[color:var(--color-border-glow)] bg-[color:var(--color-accent-glow)] p-4 text-sm">
              <div className="font-semibold flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-[color:var(--color-accent)]" />
                New device wants to pair
              </div>
              <div className="mt-2 text-xs text-[color:var(--color-text-2)]">
                Nickname: <span className="font-mono">{proposal.nickname || "(unnamed)"}</span>
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text-2)] font-mono truncate">
                credId: {proposal.credIdHash.slice(0, 18)}…{proposal.credIdHash.slice(-6)}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Reject</Button>
              <Button
                onClick={approve}
                disabled={isSigning || isBroadcasting}
                className="shadow-glow"
              >
                {isSigning ? "Confirm in wallet…" : isBroadcasting ? "Broadcasting…" : "Approve with Touch ID"}
              </Button>
            </div>
          </div>
        ) : status === "approving" ? (
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Approving on-chain…
          </div>
        ) : status === "paired" ? (
          <div className="space-y-2">
            <div className="text-success font-semibold">✓ Paired</div>
            <p className="text-sm text-[color:var(--color-text-2)]">
              The other browser can now sign transactions for this account.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-destructive font-semibold">Pairing failed</div>
            <p className="text-xs text-destructive break-words">{error}</p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
