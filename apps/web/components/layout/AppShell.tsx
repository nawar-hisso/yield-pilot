"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, short } from "../../lib/utils";
import { useWeb3Auth } from "../../src/providers/Web3Provider";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/delegate", label: "Delegate" },
  { href: "/multisig", label: "Multi-sig" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { address, isConnected, isLoading, connect, disconnect } = useWeb3Auth();

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
            {isLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : isConnected ? (
              <>
                <span className="hidden sm:inline font-mono text-sm text-muted-foreground">
                  {short(address)}
                </span>
                <button
                  onClick={disconnect}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connect}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground font-medium hover:opacity-90"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        YieldPilot · Sepolia + Base Sepolia · Scaffolded
      </footer>
    </div>
  );
}
