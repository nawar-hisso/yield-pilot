"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useTxState } from "./useTxState";

/**
 * Claims 1,000 mUSDC from the MockUSDC faucet. EOA path only — the
 * passkey path would need ETH for gas which the local node can't sponsor
 * (Pimlico doesn't cover chainId 31337).
 */
export function useFaucet() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc } = contractsFor(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const {
    isLoading: isConfirming,
    isSuccess,
    isError: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const claim = useCallback(async () => {
    if (!usdc) throw new Error("MockUSDC address not configured");
    const hash = await writeContractAsync({
      address: usdc as Address,
      abi: MockUsdcAbi,
      functionName: "faucet",
      args: [],
    });
    setTxHash(hash);
    return hash;
  }, [usdc, writeContractAsync]);

  const txState = useTxState({
    isSigning: isPending,
    isBroadcasting: isConfirming,
    isConfirmed: isSuccess,
    isError: receiptError,
    txHash,
  });

  return { claim, isPending, isConfirming, isSuccess, txHash, txState };
}
