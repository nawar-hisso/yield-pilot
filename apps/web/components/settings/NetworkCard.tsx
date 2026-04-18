"use client";

import { Network, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { NetworkBadge } from "../shared/NetworkBadge";

type Net = { id: number; name: string; rpc: string; faucet?: string; explorer?: string };

const NETWORKS: Net[] = [
  { id: 31337, name: "Hardhat local", rpc: "http://127.0.0.1:8545" },
  {
    id: 11155111,
    name: "Sepolia",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    faucet: "https://sepoliafaucet.com",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    id: 84532,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    faucet: "https://portal.cdp.coinbase.com/products/faucet",
    explorer: "https://sepolia.basescan.org",
  },
];

export function NetworkCard() {
  const activeId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Network className="h-4 w-4 text-accent" />
          Network
        </CardTitle>
        <CardDescription>
          Switch via `NEXT_PUBLIC_CHAIN_ID` in apps/web/.env.local. Full in-UI switcher lands in Phase 7.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs text-muted-foreground">Active:</span>
          <NetworkBadge />
        </div>
        <ul className="divide-y divide-border">
          {NETWORKS.map((n) => {
            const active = n.id === activeId;
            return (
              <li
                key={n.id}
                className="flex items-center justify-between py-2.5 text-sm"
                aria-current={active ? "true" : undefined}
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {n.name}
                    {active ? <span className="ml-2 text-[11px] text-accent">· current</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    chainId {n.id} · {n.rpc}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {n.faucet ? (
                    <a
                      href={n.faucet}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Faucet <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {n.explorer ? (
                    <a
                      href={n.explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                    >
                      Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
