"use client";

import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../config/wagmi";
import { initAppKit } from "../config/reown";

// Run once per browser page — the module is only loaded client-side because
// its parent Providers tree is marked "use client" and the root layout uses
// `dynamic = "force-dynamic"`. Guard with a typeof check for safety.
if (typeof window !== "undefined") {
  initAppKit();
}

/** Mounts wagmi around the app. Reown's modal attaches lazily on open(). */
export function ReownAppKitProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}
