"use client";

import { ShieldCheck, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { short } from "../../lib/utils";
import { useWallet } from "../../hooks/useWallet";

/**
 * Safe status placeholder. Full Safe SDK integration (create Safe, manage
 * owners + threshold, install guard / module) is a Phase 4 deliverable;
 * this card communicates where the user is and what's next.
 */
export function SafeStatusCard() {
  const wallet = useWallet();
  // Until Safe SDK is wired we treat "no Safe" as the default state.
  const safeAddress = null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display">Smart wallet</CardTitle>
          <CardDescription>
            bounded by the Guard&apos;s selector allow-list.
          </CardDescription>
        </div>
        <Badge variant={safeAddress ? "accent" : "outline"}>
          {safeAddress ? "Installed" : "Not created"}
        </Badge>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-lg border border-border bg-card-muted p-4"
        >
          {safeAddress ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-grad-card border-grad">
                <ShieldCheck className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Safe address</div>
                <div className="font-mono text-sm">{short(safeAddress)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">No Safe linked yet</div>
                <div className="text-xs text-muted-foreground">
                  {wallet.isConnected
                    : "Connect a wallet first. Phase 4 wires the Safe SDK to deploy a Safe for you."}
                </div>
              </div>
              <Button
                disabled
                className="shrink-0"
                title="Safe SDK integration lands in Phase 4"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create Safe
              </Button>
            </div>
          )}
        </motion.div>
      </CardContent>
    </Card>
  );
}
