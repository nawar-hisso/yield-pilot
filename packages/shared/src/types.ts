// Cross-app types. Both apps/web and apps/api import from here.

export type VaultEventKind = "Deposit" | "Withdraw" | "Redeem";

export interface VaultEvent {
  kind: VaultEventKind;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  chainId: number;
  user: `0x${string}`;
  assets?: string;
  shares?: string;
  timestamp: number;
}

export type RealtimePayload =
  | { type: "vault.event"; payload: VaultEvent }
  | { type: "ping"; payload: { ts: number } };
