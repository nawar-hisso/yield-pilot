"use client";

import useSWR from "swr";
import { YieldVaultAbi } from "@yield-pilot/contracts-abi";
import { type Address } from "viem";
import { publicClient } from "../lib/viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";

const ONE_USDC = 1_000_000n; // 1e6

export interface VaultPosition {
  /** Total USDC (6-dec) held by the vault (idle + in strategy). */
  totalAssets: bigint;
  /** Shares held by the connected user. */
  userShares: bigint;
  /** USDC value of the user's shares. */
  userAssets: bigint;
  /** Shares minted per 1 USDC at current price — share price inverse. */
  sharesPerUsdc: bigint;
}

export function useVaultPosition() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { vault } = contractsFor(chainId);

  return useSWR<VaultPosition | null>(
    vault ? ["vault-pos", vault, wallet.address ?? "none"] : null,
    async () => {
      if (!vault) return null;

      const [totalAssets, sharesPerUsdc] = await Promise.all([
        publicClient.readContract({
          address: vault,
          abi: YieldVaultAbi,
          functionName: "totalAssets",
        }),
        publicClient.readContract({
          address: vault,
          abi: YieldVaultAbi,
          functionName: "convertToShares",
          args: [ONE_USDC],
        }),
      ]);

      let userShares = 0n;
      let userAssets = 0n;
      if (wallet.address) {
        userShares = await publicClient.readContract({
          address: vault,
          abi: YieldVaultAbi,
          functionName: "balanceOf",
          args: [wallet.address as Address],
        });
        if (userShares > 0n) {
          userAssets = await publicClient.readContract({
            address: vault,
            abi: YieldVaultAbi,
            functionName: "convertToAssets",
            args: [userShares],
          });
        }
      }

      return { totalAssets, userShares, userAssets, sharesPerUsdc };
    },
    { refreshInterval: 15_000 },
  );
}
