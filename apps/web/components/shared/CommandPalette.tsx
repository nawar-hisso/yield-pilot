"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Vault,
  Users,
  ShieldCheck,
  Settings,
  Plug,
  LogOut,
  Copy,
  ExternalLink,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useWallet } from "../../hooks/useWallet";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<Ctx | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const wallet = useWallet();

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  async function copyAddress() {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    toast.success("Address copied");
    setOpen(false);
  }

  function openExplorer() {
    const base = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";
    if (wallet.address) window.open(`${base}/address/${wallet.address}`, "_blank");
    setOpen(false);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
    >
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <div
        className={cn(
          "relative z-10 w-[92vw] max-w-xl overflow-hidden rounded-xl border border-grad bg-card shadow-glow",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <Command.Input
            placeholder="Search routes, actions, shortcuts…"
            className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-background/60 px-1.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No matches.
          </Command.Empty>

          <Group heading="Navigate">
            <Item icon={LayoutDashboard} onSelect={() => go("/")}>Dashboard</Item>
            <Item icon={Vault} onSelect={() => go("/vault")}>Vault · deposit / withdraw</Item>
            <Item icon={ShieldCheck} onSelect={() => go("/multisig")}>Multi-sig · pending txs</Item>
            <Item icon={Settings} onSelect={() => go("/settings")}>Settings</Item>
          </Group>

          <Group heading="Wallet">
            {!wallet.isConnected ? (
              <Item
                icon={Plug}
                onSelect={() => {
                  setOpen(false);
                  wallet.openChooser();
                }}
              >
                Connect wallet
              </Item>
            ) : (
              <>
                <Item icon={Copy} onSelect={copyAddress} disabled={!wallet.address}>
                  Copy address
                </Item>
                <Item icon={ExternalLink} onSelect={openExplorer} disabled={!wallet.address}>
                  View on explorer
                </Item>
                <Item
                  icon={LogOut}
                  onSelect={() => {
                    setOpen(false);
                    void wallet.disconnect();
                  }}
                >
                  Disconnect
                </Item>
              </>
            )}
          </Group>
        </Command.List>

        <div className="flex items-center justify-between border-t border-border bg-card-muted/50 px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ to navigate · ↵ to select</span>
          <span>
            <kbd className="rounded bg-background/60 px-1">⌘</kbd>
            <kbd className="ml-0.5 rounded bg-background/60 px-1">K</kbd> to toggle
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon: Icon,
  children,
  onSelect,
  disabled,
}: {
  icon: typeof LayoutDashboard;
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none",
        "aria-selected:bg-accent/15 aria-selected:text-accent",
        "data-[disabled=true]:opacity-40 data-[disabled=true]:cursor-not-allowed",
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1 truncate">{children}</span>
    </Command.Item>
  );
}
