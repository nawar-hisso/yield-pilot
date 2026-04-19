"use client";

import useSWR from "swr";
import { type Address, type Hex } from "viem";
import { YieldPilotAccountAbi } from "@yield-pilot/contracts-abi";
import { publicClient } from "../lib/viem";
import { bytes32ToString } from "../lib/account";
import { useWallet } from "./useWallet";

export interface PairedKey {
  credIdHash: Hex;
  pubKeyX: Hex;
  pubKeyY: Hex;
  addedAt: number;
  active: boolean;
  nickname: string;
  isPrimary: boolean;
}

export function usePairedDevices() {
  const wallet = useWallet();
  const account = wallet.walletType === "passkey" ? (wallet.address as Address | null) : null;

  return useSWR<PairedKey[] | null>(
    account ? ["paired-devices", account] : null,
    async () => {
      if (!account) return null;
      // Account may not be deployed yet (counterfactual) — guard on code presence.
      const code = await publicClient.getBytecode({ address: account });
      if (!code || code === "0x") return [];

      const credIds = (await publicClient.readContract({
        address: account,
        abi: YieldPilotAccountAbi,
        functionName: "authorizedKeys",
      })) as readonly Hex[];

      const primary = (await publicClient.readContract({
        address: account,
        abi: YieldPilotAccountAbi,
        functionName: "primaryCredId",
      })) as Hex;

      const keys = await Promise.all(
        credIds.map(async (credId) => {
          const record = await publicClient.readContract({
            address: account,
            abi: YieldPilotAccountAbi,
            functionName: "keys",
            args: [credId],
          });
          const [x, y, addedAt, active, nickname] = record as unknown as [
            Hex, Hex, bigint | number, boolean, Hex,
          ];
          return {
            credIdHash: credId,
            pubKeyX: x,
            pubKeyY: y,
            addedAt: Number(addedAt),
            active,
            nickname: bytes32ToString(nickname),
            isPrimary: credId.toLowerCase() === primary.toLowerCase(),
          };
        }),
      );
      return keys;
    },
    { refreshInterval: 30_000 },
  );
}
