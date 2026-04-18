"use client";

import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../config/wagmi";
import { initAppKit } from "../config/reown";

// Call at module load (both SSR and client). createAppKit is safe on the
// server — it just registers config. DOM interaction only happens when
// `open()` is invoked. Calling here guarantees `useAppKit()` downstream
// won't throw "call createAppKit first".
initAppKit();

/** Mounts wagmi around the app. Reown's modal attaches lazily on open(). */
export function ReownAppKitProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}
