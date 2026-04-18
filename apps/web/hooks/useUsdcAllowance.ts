"use client";

import useSWR from "swr";
import { MockUsdcAbi } from "@yield-pilot/contracts-abi";
import { type Address } from "viem";
import { publicClient } from "../lib/viem";
import { contractsFor } from "../lib/contracts";
import { useWallet } from "./useWallet";

export function useUsdcAllowance() {
  const wallet = useWallet();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
  const { usdc, vault } = contractsFor(chainId);

  return useSWR(
    wallet.address && usdc && vault ? ["usdc-allow", usdc, wallet.address, vault] : null,
    async ([, token, owner, spender]) => {
      return publicClient.readContract({
        address: token as Address,
        abi: MockUsdcAbi,
        functionName: "allowance",
        args: [owner as Address, spender as Address],
      });
    },
    { refreshInterval: 15_000 },
  );
}
