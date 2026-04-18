"use client";

import { Lock, Check, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

type Rule = { label: string; target: string; selector: string; allowed: boolean };

// Baseline policy documented in docs/CONTRACTS.md §6. These are what the
// post-deploy wiring script will have installed once Safe SDK is live.
const RULES: Rule[] = [
  { label: "YieldVault.deposit",    target: "YieldVault", selector: "0x6e553f65", allowed: true },
  { label: "YieldVault.withdraw",   target: "YieldVault", selector: "0xb460af94", allowed: true },
  { label: "MockAave.supply",       target: "MockAave",   selector: "0x7c674e73", allowed: true },
  { label: "MockAave.withdraw",     target: "MockAave",   selector: "0x69328dec", allowed: true },
  { label: "MockUSDC.transfer",     target: "MockUSDC",   selector: "0xa9059cbb", allowed: false },
  { label: "Safe.removeOwner",      target: "Safe",       selector: "0xe318b52b", allowed: false },
  { label: "Safe.disableModule",    target: "Safe",       selector: "0xe009cfde", allowed: false },
];

  const allowCount = RULES.filter((r) => r.allowed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display flex items-center gap-2">
            <Lock className="h-4 w-4 text-accent" />
            Guard policy
          </CardTitle>
          <CardDescription>
          </CardDescription>
        </div>
        <Badge variant="accent">{allowCount} allowed · {RULES.length - allowCount} blocked</Badge>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {RULES.map((r) => (
            <li key={r.selector} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-mono truncate">{r.label}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {r.target} · {r.selector}
                </div>
              </div>
              {r.allowed ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-success/15 text-success px-2 py-0.5 text-xs">
                  <Check className="h-3 w-3" /> allow
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive px-2 py-0.5 text-xs">
                  <X className="h-3 w-3" /> block
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
