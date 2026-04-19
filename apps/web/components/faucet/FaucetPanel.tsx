"use client";

import { Coins, Fingerprint, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { TxStatusPill } from "../shared/TxStatusPill";
import { ClientOnly } from "../shared/ClientOnly";
import { useFaucet } from "../../hooks/useFaucet";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { useWallet } from "../../hooks/useWallet";
import { USDC_DECIMALS } from "../../lib/contracts";

function FaucetPanelBody() {
  const wallet = useWallet();
  const { claim, isPending, isConfirming, isSuccess, txState } = useFaucet();
  const { data: balance, mutate } = useUsdcBalance();

  const pretty =
    balance !== undefined
      ? Number(formatUnits(balance, USDC_DECIMALS)).toLocaleString()
      : "—";

  const isPasskey = wallet.walletType === "passkey";
  const waitHint = isPasskey
    ? "Gasless UserOp via the paymaster. Takes ~30-60s to mine on Sepolia."
    : "Costs a few cents of testnet ETH. Standard wagmi write call.";

  return (
    <section className="space-y-6">
      <header className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-semibold font-display">Faucet</h1>
        <p className="text-muted-foreground">
          Claim test-only mUSDC to play with deposits and withdrawals. 6-decimal ERC-20
          deployed on Sepolia; has no market value anywhere.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <Coins className="h-4 w-4 text-accent" />
                MockUSDC balance
              </CardTitle>
              <CardDescription>Your current holdings for the connected account.</CardDescription>
            </div>
            {wallet.isConnected ? (
              <Badge variant={isPasskey ? "accent" : "outline"}>
                {isPasskey ? (
                  <>
                    <Fingerprint className="mr-1 h-3 w-3" />
                    Smart account
                  </>
                ) : (
                  <>
                    <Wallet className="mr-1 h-3 w-3" />
                    EOA
                  </>
                )}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!wallet.isConnected ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Connect a wallet to claim tokens.</p>
              <Button onClick={wallet.openChooser}>Connect</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-grad-card px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-card text-accent">
                    <Coins className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Balance
                    </div>
                    <div className="mt-0.5 font-mono tabular-nums text-2xl font-semibold">
                      {pretty}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  disabled={isPending || isConfirming}
                  onClick={async () => {
                    toast.loading("Claiming 1,000 mUSDC…", { id: "faucet" });
                    try {
                      await claim();
                      await mutate();
                      toast.success("Claimed 1,000 mUSDC", { id: "faucet" });
                    } catch (err) {
                      toast.error("Faucet failed", {
                        id: "faucet",
                        description: (err as Error).message,
                      });
                    }
                  }}
                >
                  {txState === "error"
                    ? "Try again"
                    : isPending
                      ? isPasskey
                        ? "Confirm with Touch ID…"
                        : "Confirm in wallet…"
                      : isConfirming
                        ? "Broadcasting…"
                        : isSuccess
                          ? "+1,000 claimed"
                          : "Claim 1,000 mUSDC"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <TxStatusPill state={txState} />
                <p className="text-xs text-muted-foreground max-w-sm text-right">{waitHint}</p>
              </div>
            </>
          )}

          <div className="rounded-lg border border-border bg-card-muted px-4 py-3 text-xs text-muted-foreground">
            Need a lot more? The deployer can batch-mint directly —
            <code className="mx-1 rounded bg-background px-1.5 py-0.5 font-mono">
              TO=0x… AMOUNT=&lt;n&gt; npx hardhat run scripts/mint-usdc.ts
            </code>
            — or ask whoever runs the testnet.
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function FaucetPanel() {
  return (
    <ClientOnly
      fallback={
        <section className="space-y-6">
          <header>
            <h1 className="text-3xl font-semibold">Faucet</h1>
            <p className="text-muted-foreground">Loading…</p>
          </header>
        </section>
      }
    >
      <FaucetPanelBody />
    </ClientOnly>
  );
}
