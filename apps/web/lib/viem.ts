import { createPublicClient, http } from "viem";
import { sepolia, baseSepolia } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

const chain = chainId === 84532 ? baseSepolia : sepolia;

// Deliberately omit an explicit PublicClient type annotation — the version
// of `viem` reachable from apps/web may differ from that hoisted under
// packages/shared, and aligning the generic parameters at the declaration
// site triggers spurious cross-module type collisions.
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});
