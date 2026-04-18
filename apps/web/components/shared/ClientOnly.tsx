"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Defers rendering its children until after hydration. Used to gate trees
 * that call wagmi write hooks (`useWriteContract`, `useWaitForTransactionReceipt`),
 * which throw "useConfig must be used within WagmiProvider" when evaluated
 * during Next.js SSR of dynamic pages.
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
