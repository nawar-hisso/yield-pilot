"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper so three.js / react-three-fiber modules never evaluate
 * during SSR (they touch DOM/WebGL globals at import time).
 */
export const ParticleFieldLoader = dynamic(
  () => import("./ParticleField").then((m) => m.ParticleField),
  { ssr: false, loading: () => null },
);
