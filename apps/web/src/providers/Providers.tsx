"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TooltipProvider } from "../../components/ui/tooltip";
import { Toaster } from "../../components/ui/sonner";
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
      <TooltipProvider delayDuration={150}>
        <ReownAppKitProvider>
          <PasskeyAccountProvider>
            <WalletProvider>{children}</WalletProvider>
          </PasskeyAccountProvider>
        </ReownAppKitProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
