"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { publicClient } from "../lib/viem";
import { useTxState } from "./useTxState";

/**
 * USDC → YieldVault approval. `approve()` waits for the transaction to be
 * mined before resolving — callers should be able to read the updated
 * allowance immediately afterwards without racing the next deposit call.
 */
export function useApprove() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc, vault } = contractsFor(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const {
    isLoading: receiptLoading,
    isSuccess,
    isError: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const approve = useCallback(
    async (amount: bigint) => {
      if (!usdc || !vault) throw new Error("USDC or Vault address not configured");
      const hash = await writeContractAsync({
        address: usdc as Address,
        abi: MockUsdcAbi,
        functionName: "approve",
        args: [vault as Address, amount],
      });
      setTxHash(hash);
      setAwaitingReceipt(true);
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("Approval transaction reverted on-chain");
        }
        return hash;
      } finally {
        setAwaitingReceipt(false);
      }
    },
    [usdc, vault, writeContractAsync],
  );

  const isConfirming = receiptLoading || awaitingReceipt;

  const txState = useTxState({
    isSigning: isPending,
    isBroadcasting: isConfirming,
    isConfirmed: isSuccess,
    isError: receiptError,
    txHash,
  });

  return { approve, isPending, isConfirming, isSuccess, isError: receiptError, txHash, txState };
}
