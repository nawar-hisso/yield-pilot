import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, PROJECT_ID, APPKIT_NETWORKS } from "./wagmi";

/**
 * Initialise Reown AppKit — the connect modal covering MetaMask / Rainbow /
 * Coinbase / WalletConnect. **Email + social login are disabled** here on
 * purpose: new users take the separate passkey flow (PasskeyAccountProvider).
 *
 * Theme variables pick up the brand palette already declared in
 * apps/web/app/globals.css as CSS custom properties.
 */
export function initAppKit() {
  if (!PROJECT_ID) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Reown] NEXT_PUBLIC_REOWN_PROJECT_ID is empty — the wallet modal will fail. " +
        "Create a project at https://cloud.reown.com and paste the ID into apps/web/.env.local.",
    );
  }

  return createAppKit({
    adapters: [wagmiAdapter],
    networks: [APPKIT_NETWORKS[0], APPKIT_NETWORKS[1]],
    projectId: PROJECT_ID,
    metadata: {
      name: "YieldPilot",
      description: "DeFi yield management dashboard",
      url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
      icons: [],
    },
    features: {
      email: false,
      socials: [],
      onramp: false,
      swaps: false,
      analytics: false,
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "hsl(187 85% 53%)",
      "--w3m-border-radius-master": "4px",
      "--w3m-font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
    },
  });
}
