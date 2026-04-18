"use client";

import useSWR from "swr";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { publicClient } from "../lib/viem";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined;

/**
 * Phase 3 stub: once YieldVaultAbi is populated (after hardhat compile +
 * pnpm -F @yield-pilot/contracts-abi build), these reads return live data.
 */
export function useVault() {
  return useSWR(
    VAULT_ADDRESS ? ["vault", VAULT_ADDRESS] : null,
    async () => {
      if (!VAULT_ADDRESS || YieldVaultAbi.length === 0) return null;
      const [totalAssets] = await Promise.all([
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: YieldVaultAbi,
          functionName: "totalAssets",
        }),
      ]);
      return { totalAssets };
    },
    { refreshInterval: 15_000 },
  );
}
