"use client";

import { useCallback, useState } from "react";
import { type Address, type Hex } from "viem";
import {
  executeCalldata,
  revokeKeyCalldata,
  stringToBytes32,
} from "../lib/account";
import { contractsFor } from "../lib/contracts";
import { buildAndSendUserOp, waitForUserOpReceipt } from "../lib/userop";
import { useWallet } from "./useWallet";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Sign + submit `account.execute(address(this), 0, revokeKey(credId))` with
 * the current primary passkey. The on-chain `revokeKey` refuses to burn the
 * last active key, so the account can never be locked out.
 */
export function useRevokeKey() {
  const wallet = useWallet();
  const passkey = usePasskeyAccount();
  const [isSigning, setIsSigning] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<Error | null>(null);

  const revoke = useCallback(
    async (credIdHash: Hex): Promise<Hex> => {
      setError(null);
      const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
      if (chainId === 31337) {
        throw new Error(
          "Revoke requires Sepolia — Pimlico bundler doesn't serve chainId 31337.",
        );
      }
      if (wallet.walletType !== "passkey" || !passkey.passkey || !passkey.address) {
        throw new Error("Active passkey account required to revoke a key");
      }

      const { paymaster, accountFactory } = contractsFor(chainId);
      if (!paymaster) throw new Error("Paymaster address not configured");
      if (!accountFactory) throw new Error("Factory address not configured");

      const inner = revokeKeyCalldata(credIdHash);
      const callData = executeCalldata(passkey.address as Address, 0n, inner);

      setIsSigning(true);
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

        setIsSigning(false);
        setIsBroadcasting(true);
        setTxHash(userOpHash);

        const receipt = await waitForUserOpReceipt(userOpHash, chainId);
        setIsBroadcasting(false);
        setTxHash(receipt.txHash);
        if (!receipt.success) {
          throw new Error("UserOp reverted on-chain");
        }
        return receipt.txHash;
      } catch (err) {
        setIsSigning(false);
        setIsBroadcasting(false);
        setError(err as Error);
        throw err;
      }
    },
    [wallet.walletType, passkey.passkey, passkey.address],
  );

  return { revoke, isSigning, isBroadcasting, txHash, error };
}
