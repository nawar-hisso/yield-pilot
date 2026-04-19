"use client";

import { useCallback, useState } from "react";
import { type Address, type Hex } from "viem";
import { addAuthorizedKeyCalldata, executeCalldata, stringToBytes32 } from "../lib/account";
import { signUserOpHash } from "../lib/passkey";
import { useWallet } from "./useWallet";
import { usePasskeyAccount } from "../src/providers/PasskeyAccountProvider";

/**
 * Sign + submit an `account.execute(address(this), 0, addAuthorizedKey(...))`
 * UserOp with the current primary passkey. On localhost (chainId 31337) the
 * Pimlico bundler doesn't serve the network, so the hook short-circuits with
 * a clear error — the pairing UI still completes on the Browser-A side (the
 * key exchange over WS) but the on-chain step has to happen on Sepolia.
 *
 * TODO(sepolia): wire Pimlico RPC (eth_estimateUserOperationGas,
 *   eth_sendUserOperation, eth_getUserOperationReceipt) + /api/paymaster/sponsor.
 *   Calldata + signature envelope are already built here; only the bundler
 *   submission layer is missing.
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

      const nicknameBytes = stringToBytes32(input.nickname);
      const inner = addAuthorizedKeyCalldata(
        input.credIdHash,
        input.pubKeyX,
        input.pubKeyY,
        nicknameBytes,
      );
      const outer = executeCalldata(passkey.address as Address, 0n, inner);

      // userOpHash derivation is EntryPoint v0.7 spec:
      //   keccak256(abi.encode(packedUserOpHash, entrypoint, chainId))
      // We rely on the backend (/api/paymaster/sponsor) to echo the hash so
      // the frontend and signer stay in lock-step.  Full implementation
      // lands with the Sepolia deploy.
      setIsSigning(true);
      try {
        const placeholderUserOpHash =
          ("0x" + "00".repeat(32)) as Hex;
        const signed = await signUserOpHash(
          passkey.passkey.credentialId,
          placeholderUserOpHash,
        );
        void outer;
        void signed;
        setIsSigning(false);
        setIsBroadcasting(true);
        throw new Error(
          "Sepolia bundler path not yet wired — sign() succeeded, submission pending.",
        );
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
