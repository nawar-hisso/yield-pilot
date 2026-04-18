"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ReownAppKitProvider } from "./ReownAppKitProvider";
import { PasskeyAccountProvider } from "./PasskeyAccountProvider";
import { WalletProvider } from "./WalletProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ReownAppKitProvider>
        <PasskeyAccountProvider>
          <WalletProvider>{children}</WalletProvider>
        </PasskeyAccountProvider>
      </ReownAppKitProvider>
    </QueryClientProvider>
  );
}
