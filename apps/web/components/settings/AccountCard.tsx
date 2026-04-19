"use client";

import { useState } from "react";
import { UserRound, Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AddressPill } from "../shared/AddressPill";
import { useWallet } from "../../hooks/useWallet";
import { PairDeviceDialog } from "../wallet/PairDeviceDialog";

export function AccountCard() {
  const wallet = useWallet();
  const [pairOpen, setPairOpen] = useState(false);

  return (
    <>
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
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={wallet.walletType === "passkey" ? "accent" : "outline"}>
                  {wallet.walletType === "passkey" ? "Passkey smart account" : "External EOA"}
                </Badge>
                <AddressPill address={wallet.address ?? undefined} left={6} right={4} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {wallet.walletType === "passkey"
                    ? "Signed in with a device passkey. Biometric-prompted for every UserOp."
                    : "External wallet. Signs transactions directly via your wallet app."}
                </div>
                <div className="flex items-center gap-2">
                  {wallet.walletType === "passkey" ? (
                    <Button size="sm" variant="outline" onClick={() => setPairOpen(true)}>
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Pair device
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={wallet.disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <PairDeviceDialog open={pairOpen} onOpenChange={setPairOpen} />
    </>
  );
}
