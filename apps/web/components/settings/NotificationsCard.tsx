"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Skeleton } from "../ui/skeleton";
import { apiFetch } from "../../lib/api";
import { useWallet } from "../../hooks/useWallet";

interface Prefs {
  notifyDeposits: boolean;
  notifyWithdraws: boolean;
  preferredChain: string;
}

const DEFAULTS: Prefs = { notifyDeposits: true, notifyWithdraws: true, preferredChain: "sepolia" };

export function NotificationsCard() {
  const wallet = useWallet();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ preferences: Prefs | null }>(
        `/api/user/preferences?address=${wallet.address}`,
      );
      setPrefs(res.preferences ?? DEFAULTS);
    } catch (err) {
      toast.error("Couldn't load preferences", { description: (err as Error).message });
      setPrefs(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!wallet.address || !prefs) return;
    setSaving(true);
    try {
      await apiFetch<{ ok: true }>("/api/user/preferences", {
        method: "PUT",
        body: JSON.stringify({ address: wallet.address, ...prefs }),
      });
      toast.success("Preferences saved");
    } catch (err) {
      toast.error("Save failed", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" />
          Notifications
        </CardTitle>
        <CardDescription>
          Choose which on-chain events ping you. Stored in Postgres via apps/api.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!wallet.isConnected ? (
          <p className="text-sm text-muted-foreground">Connect a wallet to load preferences.</p>
        ) : loading || !prefs ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="h-6 w-60" />
          </div>
        ) : (
          <>
            <Row
              label="Notify on deposits"
              hint="Toasts + inbox entry when your EOA or Safe deposits into the vault."
              checked={prefs.notifyDeposits}
              onChange={(v) => setPrefs({ ...prefs, notifyDeposits: v })}
            />
            <Row
              label="Notify on withdrawals"
              hint="Ping when shares are burned and assets leave the vault."
              checked={prefs.notifyWithdraws}
              onChange={(v) => setPrefs({ ...prefs, notifyWithdraws: v })}
            />
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save preferences"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
