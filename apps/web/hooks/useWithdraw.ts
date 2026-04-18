"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";
import { useTxState } from "./useTxState";

/** Withdraw `assets` USDC from the vault. EOA path only for now. */
export function useWithdraw() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault } = contractsFor(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { isLoading: isConfirming, isSuccess, isError: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const withdraw = useCallback(
    async (assets: bigint) => {
      if (!vault) throw new Error("Vault address not configured for this chain");
      if (!wallet.address) throw new Error("Connect a wallet first");
      if (wallet.walletType === "passkey") {
        throw new Error(
          chainId === 31337
            ? "Withdrawals from passkey accounts need the bundler path — unsupported on localhost."
            : "Smart-account withdraw path is not yet implemented",
        );
      }

      const hash = await writeContractAsync({
        address: vault as Address,
        abi: YieldVaultAbi as never,
        functionName: "withdraw",
        args: [assets, wallet.address, wallet.address],
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
    withdraw,
    isPending,
    isConfirming,
    isSuccess,
    isError: receiptError,
    txHash,
    txState,
  };
}
