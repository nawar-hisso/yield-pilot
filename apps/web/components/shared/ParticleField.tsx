"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 480;
const RADIUS = 4.2;

function readAccent(varName: string, fallback: THREE.Color): THREE.Color {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  // "34 211 238" → Color
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length < 3) return fallback;
  const r = parts[0];
  const g = parts[1];
  const b = parts[2];
  if (r === undefined || g === undefined || b === undefined) return fallback;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function Particles({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const frame = useRef(0);

  const { positions, color } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // even distribution in a sphere shell
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = RADIUS * (0.65 + Math.random() * 0.35);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const accent = readAccent("--accent-rgb", new THREE.Color("#22D3EE"));
    const accent2 = readAccent("--accent-2-rgb", new THREE.Color("#7C3AED"));
    const mixed = accent.clone().lerp(accent2, 0.35);
    return { positions, color: mixed };
  }, []);

  useFrame((state, delta) => {
    if (reducedMotion || !ref.current) return;
    // 24fps cap — skip every other frame when delta is small
    frame.current += 1;
    if (frame.current % 2 === 0) return;
    ref.current.rotation.y += delta * 0.04;
    ref.current.rotation.x += delta * 0.015;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={0.018}
        sizeAttenuation
        depthWrite={false}
        opacity={0.65}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

/** Fullscreen R3F ambient background. Mounted once in layout.tsx. Falls back to a static gradient when `prefers-reduced-motion: reduce`. */
export function ParticleField() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  if (reduced) {
    // Static radial gradient fallback
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgb(var(--accent-rgb) / 0.10) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgb(var(--accent-2-rgb) / 0.10) 0%, transparent 50%)",
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-80"
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <Particles reducedMotion={reduced} />
        </Suspense>
      </Canvas>
    </div>
  );
}
