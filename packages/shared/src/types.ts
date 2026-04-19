// Cross-app types. Both apps/web and apps/api import from here.


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
  | { type: "safe.action"; payload: { safe: `0x${string}`; operator: `0x${string}`; target: `0x${string}`; action: string; timestamp: number } }
  | { type: "ping"; payload: { ts: number } };
