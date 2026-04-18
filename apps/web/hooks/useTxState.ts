"use client";

import { useMemo } from "react";

export type TxState = "idle" | "signing" | "broadcasting" | "confirmed" | "error";

export interface TxStateInput {
  /** Wallet popup open — user hasn't signed yet. wagmi: `isPending` on `useWriteContract`. */
  isSigning: boolean;
  /** Tx submitted, waiting for receipt. wagmi: `isLoading` on `useWaitForTransactionReceipt`. */
  isBroadcasting: boolean;
  /** Receipt confirmed. wagmi: `isSuccess`. */
  isConfirmed: boolean;
  /** Any failure — user rejected, revert, network error. */
  isError: boolean;
  /** The hash of the submitted tx, if any. Used to disambiguate post-sign / pre-receipt states. */
  txHash?: `0x${string}`;
}

/**
 * Normalise wagmi's lifecycle flags into the 5-state machine mandated by
 * knowledge/best-practices/design-system.md §1.7:
 *
 *   Idle → Signing → Broadcasting → Confirmed → Error
 */
export function useTxState({
  isSigning,
  isBroadcasting,
  isConfirmed,
  isError,
  txHash,
}: TxStateInput): TxState {
  return useMemo<TxState>(() => {
    if (isError) return "error";
    if (isConfirmed) return "confirmed";
    if (isBroadcasting) return "broadcasting";
    if (isSigning) return "signing";
    // Edge case: writeContractAsync resolved but receipt hasn't begun loading.
    if (txHash && !isConfirmed && !isError) return "broadcasting";
    return "idle";
  }, [isSigning, isBroadcasting, isConfirmed, isError, txHash]);
}

export function txStateLabel(state: TxState): string {
  switch (state) {
    case "idle": return "Idle";
    case "signing": return "Confirm in wallet…";
    case "broadcasting": return "Broadcasting…";
    case "confirmed": return "Confirmed";
    case "error": return "Failed";
  }
}
