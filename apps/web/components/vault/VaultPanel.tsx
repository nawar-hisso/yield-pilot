"use client";

import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { VaultStatsBar } from "./VaultStatsBar";
import { DepositForm } from "./DepositForm";
import { WithdrawForm } from "./WithdrawForm";
import { ClientOnly } from "../shared/ClientOnly";
import { useWallet } from "../../hooks/useWallet";

function VaultPanelBody() {
  const wallet = useWallet();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Vault</h1>
        <p className="text-muted-foreground">Deposit mUSDC to earn simulated yield.</p>
      </header>

      <VaultStatsBar />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="deposit">
            <TabsList className="w-full">
              <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
            </TabsList>
            <TabsContent value="deposit"><DepositForm /></TabsContent>
            <TabsContent value="withdraw"><WithdrawForm /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {wallet.walletType === "passkey" && wallet.chainId === 31337 ? (
        <p className="text-xs text-muted-foreground text-center">
          Gasless deposits via the passkey smart account are unsupported on localhost
          (Pimlico doesn&apos;t serve chainId 31337). Switch to an EOA wallet to test writes,
          or redeploy to Sepolia.
        </p>
      ) : wallet.walletType === "passkey" ? (
        <p className="text-xs text-muted-foreground text-center">
          Gasless deposit — approve + deposit batch in a single UserOp, sponsored by the paymaster.
        </p>
      ) : null}
    </section>
  );
}

export function VaultPanel() {
  return (
    <ClientOnly
      fallback={
        <section className="space-y-6">
          <header>
            <h1 className="text-3xl font-semibold">Vault</h1>
            <p className="text-muted-foreground">Loading…</p>
          </header>
        </section>
      }
    >
      <VaultPanelBody />
    </ClientOnly>
  );
}
