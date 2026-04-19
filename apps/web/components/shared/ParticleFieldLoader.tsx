"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * Client-side mount for the R3F ParticleField. We avoid `next/dynamic`
 * with `ssr: false` here because in Next 14.2.5 that path triggers
 * `BAILOUT_TO_CLIENT_SIDE_RENDERING` inside the root layout, which the
 * runtime turns into an HTTP 404 status (body still streams, but the
 * status code breaks health checks / SEO). A plain `useEffect` + dynamic
 * `import()` keeps the SSR tree clean while still deferring the three.js
 * chunk to the client.
 */
export function ParticleFieldLoader() {
  const [Comp, setComp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./ParticleField").then((m) => {
      if (!cancelled) setComp(() => m.ParticleField);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return Comp ? <Comp /> : null;
}
