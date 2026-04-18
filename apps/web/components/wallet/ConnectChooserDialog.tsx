"use client";

import { Wallet, Fingerprint } from "lucide-react";
import { useWallet } from "../../hooks/useWallet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "../../lib/utils";

/**
 * Two-card chooser: "Use my wallet" (Reown AppKit) vs "Create smart account"
 * (our passkey flow). Nothing here renders Reown's modal — that's opened by
 * `wallet.chooseEoa()` via `useAppKit().open()`.
 */
export function ConnectChooserDialog() {
  const wallet = useWallet();

  return (
    <Dialog open={wallet.chooserOpen} onOpenChange={(open) => (open ? wallet.openChooser() : wallet.closeChooser())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Connect to YieldPilot</DialogTitle>
          <DialogDescription>
            Pick how you want to get started. Both paths work with the same app — you can switch later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <ChoiceCard
            icon={<Wallet className="h-6 w-6" aria-hidden />}
            title="Use my wallet"
            subtitle="MetaMask, Rainbow, Coinbase, WalletConnect"
            onClick={wallet.chooseEoa}
            accent={false}
          />
          <ChoiceCard
            icon={<Fingerprint className="h-6 w-6" aria-hidden />}
            title={wallet.hasPasskey ? "Continue with passkey" : "Create smart account"}
            subtitle={
              wallet.hasPasskey
                ? "Reuse your existing passkey — same smart-account address."
                : "Use Face ID or Touch ID — no wallet required. Gasless deposits."
            }
            onClick={() => void wallet.choosePasskey()}
            accent
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  accent: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border border-border p-4 transition hover:border-accent hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        accent && "border-accent/40",
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", accent ? "bg-accent/20 text-accent" : "bg-secondary text-secondary-foreground")}>
        {icon}
      </div>
      <div className="mt-3 font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
    </button>
  );
}
