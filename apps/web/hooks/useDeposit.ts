"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MockUsdcAbi, YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { encodeFunctionData, maxUint256, type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { publicClient } from "../lib/viem";
import { useWallet } from "./useWallet";
import { useTxState } from "./useTxState";
import { executeBatchCalldata, executeCalldata, stringToBytes32 } from "../lib/account";
import { buildAndSendUserOp, waitForUserOpReceipt } from "../lib/userop";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Deposit USDC into the YieldVault.
 *
 * - EOA path: wagmi `useWriteContract` (a single tx — assumes approval has
 *   already happened separately, which `VaultPanel` ensures).
 * - Passkey path: `buildAndSendUserOp` with an `executeBatch` callData that
 *   atomically `approve` + `deposit` from the smart account in one UserOp.
 *   Gas is sponsored by the paymaster; no ETH needed at the account.
 */
export function useDeposit() {
  const wallet = useWallet();
  const passkey = usePasskeyAccount();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault, usdc, paymaster, accountFactory } = contractsFor(chainId);

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
        if (!usdc) throw new Error("USDC address not configured");
        if (!paymaster) throw new Error("Paymaster address not configured");
        if (!accountFactory) throw new Error("Factory address not configured");
        if (!passkey.passkey || !passkey.address) {
          throw new Error("Passkey account not ready");
        }

        // Atomic path: when allowance is insufficient we batch
        // [approve-max, deposit] into a single `executeBatch` UserOp. The
        // paymaster now sponsors both selectors, so first-time and repeat
        // deposits are both a single Touch ID.
        const initCodeArgs = {
          factory: accountFactory as Address,
          credIdHash: passkey.passkey.credIdHash as Hex,
          pubKeyX: passkey.passkey.pubKeyX as Hex,
          pubKeyY: passkey.passkey.pubKeyY as Hex,
          nickname: stringToBytes32(passkey.passkey.nickname),
          salt: 0n,
        };

        const currentAllowance = (await publicClient.readContract({
          address: usdc as Address,
          abi: MockUsdcAbi,
          functionName: "allowance",
          args: [passkey.address as Address, vault as Address],
        })) as bigint;

        setPasskeyState({
          signing: true,
          broadcasting: false,
          confirmed: false,
          error: false,
          txHash: undefined,
        });

        try {
          const depositData = encodeFunctionData({
            abi: YieldVaultAbi,
            functionName: "deposit",
            args: [assets, passkey.address],
          });

          let callData: Hex;
          if (currentAllowance < assets) {
            const approveData = encodeFunctionData({
              abi: MockUsdcAbi,
              functionName: "approve",
              args: [vault as Address, maxUint256],
            });
            callData = executeBatchCalldata(
              [usdc as Address, vault as Address],
              [0n, 0n],
              [approveData, depositData],
            );
          } else {
            callData = executeCalldata(vault as Address, 0n, depositData);
          }

          const depositUserOpHash = await buildAndSendUserOp({
            sender: passkey.address as Address,
            callData,
            chainId,
            paymaster: paymaster as Address,
            credentialId: passkey.passkey.credentialId,
            initCodeArgs,
          });

          setPasskeyState((s) => ({ ...s, signing: false, broadcasting: true, txHash: depositUserOpHash }));
          const receipt = await waitForUserOpReceipt(depositUserOpHash, chainId);
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
        functionName: "deposit",
        args: [assets, wallet.address],
      });
      setEoaTxHash(hash);
      return hash;
    },
    [
      vault,
      usdc,
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
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    txHash,
    txState,
  };
}
