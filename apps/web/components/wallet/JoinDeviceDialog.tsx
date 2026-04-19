"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { registerPasskey, savePasskey } from "../../lib/passkey";
import type { Address } from "viem";

interface ParsedLink {
  nonce: string;
  accountAddress: Address;
}

function parsePairUrl(raw: string): ParsedLink | null {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `http://x${raw.startsWith("/") ? raw : "/" + raw}`);
    const nonce = u.searchParams.get("pair");
    const account = u.searchParams.get("account");
    if (!nonce || !/^[0-9a-fA-F]{32,}$/.test(nonce)) return null;
    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) return null;
    return { nonce, accountAddress: account as Address };
  } catch {
    return null;
  }
}

function apiOrigin(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return apiUrl.replace(/^http/, "ws");
}

export function JoinDeviceDialog({
  open,
  onOpenChange,
  initialLink,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLink?: string;
}) {
  const [raw, setRaw] = useState(initialLink ?? "");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<"idle" | "registering" | "waiting" | "paired" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (initialLink) setRaw(initialLink);
  }, [initialLink]);

  const submit = useCallback(async () => {
    setError(null);
    const parsed = parsePairUrl(raw);
    if (!parsed) { setError("Pairing link looks invalid"); return; }

    setStatus("registering");
    let record;
    try {
      record = await registerPasskey({ persist: false, nickname });
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
      return;
    }

    setStatus("waiting");
    const ws = new WebSocket(`${apiOrigin()}/ws/pair`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "pair:join", nonce: parsed.nonce, role: "guest" }));
    };
    ws.onmessage = async (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "pair:ready" || m.type === "pair:joined") {
          // Send proposal.
          ws.send(JSON.stringify({
            type: "pair:propose",
            credIdHash: record.credIdHash,
            pubKeyX: record.pubKeyX,
            pubKeyY: record.pubKeyY,
            credentialId: record.credentialId,
            nickname: record.nickname,
          }));
        } else if (m.type === "pair:complete") {
          // Browser A confirmed on-chain. Cache the record locally.
          await savePasskey(record);
          setStatus("paired");
          toast.success("Linked to existing account");
        } else if (m.type === "pair:closed") {
          setStatus("error");
          setError("Other device disconnected before completing");
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = () => {
      setStatus("error");
      setError("WebSocket error");
    };
  }, [raw, nickname]);

  useEffect(() => {
    if (!open && wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Link to an existing account</DialogTitle>
          <DialogDescription>
            Paste the pairing link from your other device. You&apos;ll register a fresh passkey on
            this browser; the other device approves it on-chain so both sign for the same account.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" || status === "error" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-3)]">
                Pairing link
              </label>
              <Input
                className="mt-1 font-mono text-xs"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="http://localhost:3000/?pair=…&account=0x…"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-3)]">
                Nickname for this device (optional)
              </label>
              <Input
                className="mt-1"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 32))}
                placeholder="e.g. MacBook · Brave"
              />
            </div>
            {error ? <p className="text-xs text-destructive break-words">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!raw}>
                <Fingerprint className="mr-2 h-4 w-4" />
                Register passkey
              </Button>
            </div>
          </div>
        ) : status === "registering" ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Registering passkey — confirm with Touch ID…
          </div>
        ) : status === "waiting" ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for the other device to approve on-chain…
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-success font-semibold">✓ Linked</div>
            <p className="text-sm text-[color:var(--color-text-2)]">
              This browser now signs for the same smart-account address.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
