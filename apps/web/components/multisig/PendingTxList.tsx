"use client";

import { ShieldCheck, Check, X, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../shared/EmptyState";
import { short } from "../../lib/utils";

type PendingTx = {
  hash: string;
  to: string;
  method: string;
  confirmations: number;
  threshold: number;
};

// Demo: one pending tx to illustrate the shape. Real data comes from
// Safe's Transaction Service API once Safe SDK is wired.
const PENDING: PendingTx[] = [];

export function PendingTxList() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Pending transactions
          </CardTitle>
          <CardDescription>
            Awaiting owner signatures. Execution triggers automatically once the threshold is met.
          </CardDescription>
        </div>
        <Badge variant="outline">2 of 3 threshold</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {PENDING.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No pending transactions"
            description="Team-managed vaults queue Safe txs here. Sign or reject; the app executes automatically when the owner threshold signs."
          />
        ) : (
          PENDING.map((tx) => (
            <motion.div
              key={tx.hash}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-lg border border-border bg-card-muted p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-sm font-medium">{tx.method}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                    to {short(tx.to)} · {short(tx.hash)}
                    <a
                      className="inline-flex items-center gap-0.5 ml-1 hover:text-accent"
                      href="#"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <Badge variant="accent">
                  {tx.confirmations} / {tx.threshold} sigs
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm">
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Sign
                </Button>
                <Button size="sm" variant="outline">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
