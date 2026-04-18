// Chain registry — mirrors knowledge/networks/<chain>.md. Single source of truth
// for RPC defaults, explorer URLs, and Web3Auth network selection.

export const SUPPORTED_CHAINS = {
  sepolia: {
    id: 11155111,
    name: "Sepolia",
    ticker: "ETH",
    rpcUrlEnv: "RPC_URL_SEPOLIA",
    rpcUrlDefault: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    web3authNetwork: "sapphire_devnet",
  },
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    ticker: "ETH",
    rpcUrlEnv: "RPC_URL_BASE_SEPOLIA",
    rpcUrlDefault: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    web3authNetwork: "sapphire_devnet",
  },
} as const;

export type ChainSlug = keyof typeof SUPPORTED_CHAINS;
export const CHAIN_SLUGS = Object.keys(SUPPORTED_CHAINS) as ChainSlug[];

export function getChainById(id: number) {
  return Object.values(SUPPORTED_CHAINS).find((c) => c.id === id);
}
