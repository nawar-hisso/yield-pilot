"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";
import { useTxState } from "./useTxState";
import { executeCalldata, stringToBytes32 } from "../lib/account";
import { buildAndSendUserOp, waitForUserOpReceipt } from "../lib/userop";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Claims 1,000 mUSDC from the MockUSDC faucet.
 *
 * - EOA path: direct wagmi call (`MockUSDC.faucet()`).
 * - Passkey path: UserOp through the smart account (`execute(usdc, 0, faucet())`),
 *   sponsored by our paymaster. USDC is in the paymaster's allowed targets.
 */
export function useFaucet() {
  const wallet = useWallet();
  const passkey = usePasskeyAccount();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc, paymaster, accountFactory } = contractsFor(chainId);

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

  const claim = useCallback(async () => {
    if (!usdc) throw new Error("MockUSDC address not configured");

    if (wallet.walletType === "passkey") {
      if (!paymaster) throw new Error("Paymaster address not configured");
      if (!accountFactory) throw new Error("Factory address not configured");
      if (!passkey.passkey || !passkey.address) {
        throw new Error("Passkey account not ready");
      }

      const faucetData = encodeFunctionData({
        abi: MockUsdcAbi,
        functionName: "faucet",
        args: [],
      });
      const callData = executeCalldata(usdc as Address, 0n, faucetData);

      setPasskeyState({
        signing: true,
        broadcasting: false,
        confirmed: false,
        error: false,
        txHash: undefined,
      });

      try {
        const userOpHash = await buildAndSendUserOp({
          sender: passkey.address as Address,
          callData,
          chainId,
          paymaster: paymaster as Address,
          credentialId: passkey.passkey.credentialId,
          initCodeArgs: {
            factory: accountFactory as Address,
            credIdHash: passkey.passkey.credIdHash as Hex,
            pubKeyX: passkey.passkey.pubKeyX as Hex,
            pubKeyY: passkey.passkey.pubKeyY as Hex,
            nickname: stringToBytes32(passkey.passkey.nickname),
            salt: 0n,
          },
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
      address: usdc as Address,
      abi: MockUsdcAbi,
      functionName: "faucet",
      args: [],
    });
    setEoaTxHash(hash);
    return hash;
  }, [
    usdc,
    paymaster,
    accountFactory,
    wallet.walletType,
    writeContractAsync,
    chainId,
    passkey.address,
    passkey.passkey,
  ]);

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

  return { claim, isPending, isConfirming, isSuccess, isError, txHash, txState };
}
