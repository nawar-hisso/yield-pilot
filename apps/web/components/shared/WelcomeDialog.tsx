"use client";

import { useEffect, useState } from "react";
import { Sparkles, Vault, KeyRound, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useWallet } from "../../hooks/useWallet";

const STORAGE_KEY = "yp:onboarded";

export function WelcomeDialog() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const t = window.setTimeout(() => setOpen(true), 450);
        return () => window.clearTimeout(t);
      }
    } catch {
      // storage disabled (private mode) — just skip the prompt
    }
  }, []);

  function close() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
  }

  function connectNow() {
    close();
    wallet.openChooser();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-lg border-grad">
        <DialogHeader>
          <div className="mx-auto sm:mx-0 mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-grad-hero shadow-glow text-primary-foreground">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <DialogTitle className="font-display text-xl">
            Welcome to <span className="text-grad">YieldPilot</span>
          </DialogTitle>
          <DialogDescription>
            A testnet yield dashboard. Two things to know before you connect.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <Row
            icon={<Vault className="h-4 w-4 text-accent" strokeWidth={1.75} />}
            title="Deposit mUSDC into the vault"
            body="Shares track your slice of a mock Aave strategy. Withdraw any time."
          />
          <Row
            icon={<KeyRound className="h-4 w-4 text-brand-fuchsia" strokeWidth={1.75} />}
            title="Connect EOA or create a passkey"
            body="Existing wallet? Reown modal. New user? Register a passkey (Face ID / Touch ID) and skip seed phrases."
          />
        </div>

        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Skip tour
          </Button>
          <Button onClick={connectNow} className="shadow-glow">
            <Wallet className="mr-2 h-4 w-4" strokeWidth={1.75} />
            Connect
          </Button>
        </div>

        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          Press <kbd className="rounded bg-card-muted px-1">⌘K</kbd> anywhere for quick nav.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card-muted/40 p-3">
      <div className="mt-0.5 shrink-0 rounded-md border border-border bg-background/60 p-1.5">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}
