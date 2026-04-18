"use client";

import { useState } from "react";
import { UserRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { short } from "../../lib/utils";
import { useWallet } from "../../hooks/useWallet";

export function AccountCard() {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <UserRound className="h-4 w-4 text-accent" />
          Account
        </CardTitle>
        <CardDescription>Connected wallet + session controls.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!wallet.isConnected ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">No wallet connected.</p>
            <Button onClick={wallet.openChooser}>Connect</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Badge variant={wallet.walletType === "passkey" ? "accent" : "outline"}>
                {wallet.walletType === "passkey" ? "Passkey smart account" : "External EOA"}
              </Badge>
              <div className="font-mono text-sm">{short(wallet.address, 8, 6)}</div>
              <Button
                size="icon"
                variant="ghost"
                onClick={copyAddress}
                aria-label="Copy address"
                className="h-8 w-8"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {wallet.walletType === "passkey"
                  ? "Signed in with a device passkey. Biometric-prompted for every UserOp."
                  : "External wallet. Signs transactions directly via your wallet app."}
              </div>
              <Button size="sm" variant="outline" onClick={wallet.disconnect}>
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
