import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia } from "@reown/appkit/networks";

/**
 * Single source of truth for wagmi configuration across the app.
 *
 * Reown's WagmiAdapter wires together:
 *   - wagmi connectors (injected / WalletConnect / Coinbase)
 *   - the chains list
 *   - storage for reconnect persistence
 * It's built once at module load and reused by both `<WagmiProvider>` and
 * `createAppKit(...)`.
 */
export const PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

/** Chains supported by the dApp — order matters; first is the default. */
export const APPKIT_NETWORKS = [sepolia, baseSepolia] as const;

export const wagmiAdapter = new WagmiAdapter({
  projectId: PROJECT_ID,
  networks: [sepolia, baseSepolia],
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
