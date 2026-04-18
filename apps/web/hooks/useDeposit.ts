"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";
import { useTxState } from "./useTxState";

/**
 * Deposit USDC into the YieldVault. EOA path uses wagmi's useWriteContract;
 * passkey (smart-account) path will go through a paymaster-sponsored UserOp
 * once Sepolia deployment lands — for now it throws with a helpful message
 * on chainId 31337 (Pimlico doesn't serve localhost).
 */
export function useDeposit() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault } = contractsFor(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { isLoading: isConfirming, isSuccess, isError: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const deposit = useCallback(
    async (assets: bigint) => {
      if (!vault) throw new Error("Vault address not configured for this chain");
      if (!wallet.address) throw new Error("Connect a wallet first");

      if (wallet.walletType === "passkey") {
        if (chainId === 31337) {
          throw new Error(
            "Gasless deposits aren't supported on localhost (chainId 31337). Deploy to Sepolia + fund the Paymaster, or switch to the EOA path.",
          );
        }
        // Sepolia + Base Sepolia UserOp path lands here once the bundler is wired.
        throw new Error("Smart-account deposit path is not yet implemented");
      }

      const hash = await writeContractAsync({
        address: vault as Address,
        abi: YieldVaultAbi as never,
        functionName: "deposit",
        args: [assets, wallet.address],
      });
      setTxHash(hash);
      return hash;
    },
    [vault, wallet.address, wallet.walletType, writeContractAsync, chainId],
  );

  const txState = useTxState({
    isSigning: isPending,
    isBroadcasting: isConfirming,
    isConfirmed: isSuccess,
    isError: receiptError,
    txHash,
  });

  return {
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    isError: receiptError,
    txHash,
    txState,
  };
}
