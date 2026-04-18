"use client";

import useSWR from "swr";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { publicClient } from "../lib/viem";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined;

/**
 * Returns live TVL + share-price reads. Skips entirely if the vault address
 * isn't wired yet (pre-deploy). Refreshes every 15s via SWR.
 */
export function useVault() {
  return useSWR(
    VAULT_ADDRESS ? ["vault", VAULT_ADDRESS] : null,
    async () => {
      if (!VAULT_ADDRESS) return null;
      const totalAssets = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: YieldVaultAbi as never,
        functionName: "totalAssets",
      });
      return { totalAssets: totalAssets as bigint };
    },
    { refreshInterval: 15_000 },
  );
}
