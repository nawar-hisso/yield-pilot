import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia, baseSepolia } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

const chain = chainId === 84532 ? baseSepolia : sepolia;

export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});
