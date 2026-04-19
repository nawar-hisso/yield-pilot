"use client";

import { useCallback, useState } from "react";
import { type Address, type Hex } from "viem";
import {
  addAuthorizedKeyCalldata,
  executeCalldata,
  stringToBytes32,
} from "../lib/account";
import { contractsFor } from "../lib/contracts";
import { buildAndSendUserOp, waitForUserOpReceipt } from "../lib/userop";
import { useWallet } from "./useWallet";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Sign + submit `account.execute(address(this), 0, addAuthorizedKey(...))`
 * with the current primary passkey. Gas sponsored by the Paymaster. Returns
 * the underlying transaction hash once the bundler confirms the UserOp.
 *
 * On localhost (chainId 31337) Pimlico doesn't serve the network, so the hook
 * short-circuits with a clear error — the pairing UI still completes its
 * off-chain WS handshake but the on-chain step has to happen on Sepolia.
 */
export interface AddKeyInput {
  credIdHash: Hex;
  pubKeyX: Hex;
  pubKeyY: Hex;
  nickname?: string;
}

export function useAddAuthorizedKey() {
  const wallet = useWallet();
  const passkey = usePasskeyAccount();
  const [isSigning, setIsSigning] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<Error | null>(null);

  const authorize = useCallback(
    async (input: AddKeyInput): Promise<Hex> => {
      setError(null);
      const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
      if (chainId === 31337) {
        throw new Error(
          "Pairing requires Sepolia — Pimlico bundler doesn't serve chainId 31337. Deploy + switch networks to complete.",
        );
      }
      if (wallet.walletType !== "passkey" || !passkey.passkey || !passkey.address) {
        throw new Error("Active passkey account required to authorize a new key");
      }

      const { paymaster, accountFactory } = contractsFor(chainId);
      if (!paymaster) throw new Error("Paymaster address not configured");
      if (!accountFactory) throw new Error("Factory address not configured");

      const nicknameBytes = stringToBytes32(input.nickname);
      const inner = addAuthorizedKeyCalldata(
        input.credIdHash,
        input.pubKeyX,
        input.pubKeyY,
        nicknameBytes,
      );
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

  return { authorize, isSigning, isBroadcasting, txHash, error };
}
