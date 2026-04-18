"use client";

import { usePathname } from "next/navigation";
import { short } from "../../lib/utils";
import { useWallet } from "../../hooks/useWallet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { HeaderBalance } from "../shared/HeaderBalance";
import { NetworkBadge } from "../shared/NetworkBadge";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "Portfolio value · P&L · live activity" },
  "/vault": { title: "Vault", sub: "Deposit · withdraw · sponsor gas" },
  "/multisig": { title: "Multi-sig", sub: "Pending signatures · execute threshold" },
  "/settings": { title: "Settings", sub: "Notifications · network · account" },
};

export function TopBar() {
  const pathname = usePathname();
  const wallet = useWallet();
  const meta = TITLES[pathname] ?? { title: "YieldPilot", sub: "" };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/75 px-4 lg:px-8 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="font-display text-base font-semibold leading-tight truncate">{meta.title}</div>
        <div className="hidden sm:block text-xs text-muted-foreground truncate">{meta.sub}</div>
      </div>

      <NetworkBadge />
      <HeaderBalance />

      {wallet.isLoading ? (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ) : wallet.isConnected ? (
        <>
          <Badge variant={wallet.walletType === "passkey" ? "accent" : "outline"}>
            {wallet.walletType === "passkey" ? "Passkey" : "EOA"}
          </Badge>
          <span className="hidden sm:inline font-mono text-sm text-muted-foreground">
            {short(wallet.address)}
          </span>
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
