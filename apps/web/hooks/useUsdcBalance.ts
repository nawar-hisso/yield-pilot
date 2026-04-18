"use client";

import useSWR from "swr";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { type Address } from "viem";
import { publicClient } from "../lib/viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";

export function useUsdcBalance() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc } = contractsFor(chainId);

  return useSWR(
    wallet.address && usdc ? ["usdc-bal", usdc, wallet.address] : null,
    async ([, token, user]) => {
      return publicClient.readContract({
        address: token as Address,
        abi: MockUsdcAbi,
        functionName: "balanceOf",
        args: [user as Address],
      });
    },
    { refreshInterval: 15_000 },
  );
}
