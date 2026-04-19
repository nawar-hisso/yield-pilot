"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";
import { useTxState } from "./useTxState";
import { executeCalldata, stringToBytes32 } from "../lib/account";
import { buildAndSendUserOp, waitForUserOpReceipt } from "../lib/userop";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Withdraw `assets` USDC from the vault.
 *
 * - EOA path: wagmi `useWriteContract` (a single tx — vault shares are burned
 *   and USDC returned to the sender).
 * - Passkey path: a single `execute()` UserOp targeting the vault, sponsored
 *   by the paymaster. No approve step is needed — ERC-4626 `withdraw` burns
 *   the caller's shares directly.
 */
export function useWithdraw() {
  const wallet = useWallet();
  const passkey = usePasskeyAccount();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault, paymaster, accountFactory } = contractsFor(chainId);

  const { writeContractAsync, isPending: eoaSigning } = useWriteContract();
  const [eoaTxHash, setEoaTxHash] = useState<Hex | undefined>();
  const {
    isLoading: eoaConfirming,
    isSuccess: eoaSuccess,
    isError: eoaReceiptError,
  } = useWaitForTransactionReceipt({ hash: eoaTxHash });

  const [passkeyState, setPasskeyState] = useState<{
    signing: boolean;
    broadcasting: boolean;
    confirmed: boolean;
    error: boolean;
    txHash: Hex | undefined;
  }>({
    signing: false,
    broadcasting: false,
    confirmed: false,
    error: false,
    txHash: undefined,
  });

  const withdraw = useCallback(
    async (assets: bigint) => {
      if (!vault) throw new Error("Vault address not configured for this chain");
      if (!wallet.address) throw new Error("Connect a wallet first");

      if (wallet.walletType === "passkey") {
        if (chainId === 31337) {
          throw new Error(
            "Gasless withdrawals aren't supported on localhost (chainId 31337). Deploy to Sepolia + fund the Paymaster, or switch to the EOA path.",
          );
        }
        if (!paymaster) throw new Error("Paymaster address not configured");
        if (!accountFactory) throw new Error("Factory address not configured");
        if (!passkey.passkey || !passkey.address) {
          throw new Error("Passkey account not ready");
        }

        const initCodeArgs = {
          factory: accountFactory as Address,
          credIdHash: passkey.passkey.credIdHash as Hex,
          pubKeyX: passkey.passkey.pubKeyX as Hex,
          pubKeyY: passkey.passkey.pubKeyY as Hex,
          nickname: stringToBytes32(passkey.passkey.nickname),
          salt: 0n,
        };

        setPasskeyState({
          signing: true,
          broadcasting: false,
          confirmed: false,
          error: false,
          txHash: undefined,
        });

        try {
          const withdrawData = encodeFunctionData({
            abi: YieldVaultAbi,
            functionName: "withdraw",
            args: [assets, passkey.address, passkey.address],
          });
          const withdrawCallData = executeCalldata(vault as Address, 0n, withdrawData);
          const userOpHash = await buildAndSendUserOp({
            sender: passkey.address as Address,
            callData: withdrawCallData,
            chainId,
            paymaster: paymaster as Address,
            credentialId: passkey.passkey.credentialId,
            initCodeArgs,
          });

          setPasskeyState((s) => ({ ...s, signing: false, broadcasting: true, txHash: userOpHash }));
          const receipt = await waitForUserOpReceipt(userOpHash, chainId);
          setPasskeyState((s) => ({
            ...s,
            broadcasting: false,
            confirmed: receipt.success,
            error: !receipt.success,
            txHash: receipt.txHash,
          }));
          return receipt.txHash;
        } catch (err) {
          setPasskeyState((s) => ({ ...s, signing: false, broadcasting: false, error: true }));
          throw err;
        }
      }

      const hash = await writeContractAsync({
        address: vault as Address,
        abi: YieldVaultAbi,
        functionName: "withdraw",
        args: [assets, wallet.address, wallet.address],
      });
      setEoaTxHash(hash);
      return hash;
    },
    [
      vault,
      paymaster,
      accountFactory,
      wallet.address,
      wallet.walletType,
      writeContractAsync,
      chainId,
      passkey.address,
      passkey.passkey,
    ],
  );

  const isPasskey = wallet.walletType === "passkey";
  const isPending = isPasskey ? passkeyState.signing : eoaSigning;
  const isConfirming = isPasskey ? passkeyState.broadcasting : eoaConfirming;
  const isSuccess = isPasskey ? passkeyState.confirmed : eoaSuccess;
  const isError = isPasskey ? passkeyState.error : eoaReceiptError;
  const txHash = isPasskey ? passkeyState.txHash : eoaTxHash;

  const txState = useTxState({
    isSigning: isPending,
    isBroadcasting: isConfirming,
    isConfirmed: isSuccess,
    isError,
    txHash,
  });

  return {
    withdraw,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    txHash,
    txState,
  };
}
