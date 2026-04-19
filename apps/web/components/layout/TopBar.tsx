"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useWallet } from "../../hooks/useWallet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { HeaderBalance } from "../shared/HeaderBalance";
import { NetworkBadge } from "../shared/NetworkBadge";
import { AddressPill } from "../shared/AddressPill";
import { useCommandPalette } from "../shared/CommandPalette";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "Portfolio value · P&L · live activity" },
  "/vault": { title: "Vault", sub: "Deposit · withdraw · sponsor gas" },
  "/faucet": { title: "Faucet", sub: "Claim mUSDC · mock controls" },
  "/multisig": { title: "Multi-sig", sub: "Pending signatures · execute threshold" },
  "/settings": { title: "Settings", sub: "Notifications · network · account" },
};

export function TopBar() {
  const pathname = usePathname();
  const wallet = useWallet();
  const palette = useCommandPalette();
  const meta = TITLES[pathname] ?? { title: "YieldPilot", sub: "" };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/75 px-4 lg:px-8 backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold leading-tight truncate text-white [text-shadow:0_0_12px_rgb(var(--accent-rgb)/0.25)]">{meta.title}</div>
        <div className="hidden sm:block text-xs font-normal text-[color:var(--color-text-2)] truncate">{meta.sub}</div>
      </div>

      <button
        type="button"
        onClick={() => palette.setOpen(true)}
        aria-label="Open command palette"
        className="hidden md:inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-card-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>Search…</span>
        <kbd className="ml-4 inline-flex h-5 items-center rounded border border-border bg-background/60 px-1.5 text-[10px]">
          ⌘K
        </kbd>
      </button>

      <NetworkBadge />
      <HeaderBalance />

      {wallet.isLoading ? (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ) : wallet.isConnected ? (
        <>
          <Badge variant={wallet.walletType === "passkey" ? "accent" : "outline"}>
            {wallet.walletType === "passkey" ? "Passkey" : "EOA"}
          </Badge>
          <div className="hidden sm:inline-flex">
            <AddressPill address={wallet.address ?? undefined} />
          </div>
          <Button size="sm" variant="outline" onClick={wallet.disconnect}>
            Disconnect
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={wallet.openChooser} className="shadow-glow">
          Connect
        </Button>
      )}
    </header>
  );
}
