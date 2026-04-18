"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, short } from "../../lib/utils";
import { useWallet } from "../../hooks/useWallet";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConnectChooserDialog } from "../wallet/ConnectChooserDialog";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/delegate", label: "Delegate" },
  { href: "/multisig", label: "Multi-sig" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useWallet();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <span className="inline-block h-3 w-3 rounded-full bg-accent" aria-hidden />
            YieldPilot
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "transition-colors hover:text-accent",
                  pathname === item.href ? "text-accent" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
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
              <Button size="sm" onClick={wallet.openChooser}>
                Connect
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        YieldPilot · Sepolia + Base Sepolia · Scaffolded
      </footer>
      <ConnectChooserDialog />
    </div>
  );
}
