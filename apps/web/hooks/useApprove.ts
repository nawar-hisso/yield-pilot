"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useTxState } from "./useTxState";

/** USDC → YieldVault approval. Caller passes the exact allowance amount. */
export function useApprove() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc, vault } = contractsFor(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const {
    isLoading: isConfirming,
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
      return hash;
    },
    [usdc, vault, writeContractAsync],
  );

  const txState = useTxState({
    isSigning: isPending,
    isBroadcasting: isConfirming,
    isConfirmed: isSuccess,
    isError: receiptError,
    txHash,
  });

  return { approve, isPending, isConfirming, isSuccess, isError: receiptError, txHash, txState };
}
