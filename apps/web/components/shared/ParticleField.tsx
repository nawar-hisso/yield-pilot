"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * Layered R3F ambient background.
 *
 * Layers (back → front, all drawn in a single Canvas):
 *   1. Perspective grid floor plane (1 draw call)
 *   2. Three large blurred orbs — accent / accent-2 / white (3 draw calls)
 *   3. Small-tier particles, slow parallax Lissajous drift (1 draw call)
 *   4. Large-tier particles, ditto (1 draw call)
 * Total draw calls: 6 (spec cap: 8).
 *
 * A single MouseParallax group rotates everything subtly in response to
 * pointer motion; orbs appear slower than particles because their z-depth
 * is larger (parallax-by-depth, no separate speed coefficient needed).
 *
 * Frame cap: 30fps via useFrame delta accumulation.
 * Reduced motion: renders only the small-tier particle layer at 20% opacity
 * with motion disabled (static distribution).
 */

const SMALL_COUNT = 2400;
const LARGE_COUNT = 600;
const FRAME_INTERVAL = 1 / 30; // 30fps cap

const WHITE = new THREE.Color(1, 1, 1);

function readRgb(varName: string, fallback: THREE.Color): THREE.Color {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length < 3) return fallback;
  const r = parts[0];
  const g = parts[1];
  const b = parts[2];
  if (r === undefined || g === undefined || b === undefined) return fallback;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// ─── Layer: particles ─────────────────────────────────────────────────────

function ParticleLayer({
  size,
  count,
  seed,
  animated,
  colorMix,
}: {
  size: number;
  count: number;
  seed: number;
  animated: boolean;
  colorMix: "accent" | "accent-2" | "white-tint";
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);
  const accumRef = useRef(0);

  // Precompute positions + per-particle Lissajous params (freq + phase).
  const { positions, phases } = useMemo(() => {
    // mulberry32 seeded so SSR → CSR don't diverge (no hydration warnings).
    let a = seed | 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      // depth 2..8 — gives z-parallax
      const r = 2 + rand() * 6;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i * 4] = 0.3 + rand() * 0.7; // freqX
      phases[i * 4 + 1] = 0.3 + rand() * 0.7; // freqY
      phases[i * 4 + 2] = rand() * Math.PI * 2; // phaseX
      phases[i * 4 + 3] = rand() * Math.PI * 2; // phaseY
    }
    return { positions, phases };
  }, [count, seed]);

  const color = useMemo(() => {
    const accent = readRgb("--accent-rgb", new THREE.Color("#22D3EE"));
    const accent2 = readRgb("--accent-2-rgb", new THREE.Color("#7C3AED"));
    if (colorMix === "accent") return accent;
    if (colorMix === "accent-2") return accent.clone().lerp(accent2, 0.75);
    return WHITE;
  }, [colorMix]);

  useFrame((_state, delta) => {
    if (!animated || !pointsRef.current) return;
    accumRef.current += delta;
    if (accumRef.current < FRAME_INTERVAL) return;
    const dt = accumRef.current;
    accumRef.current = 0;
    timeRef.current += dt;
    const t = timeRef.current;

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const base = i * 3;
      const z = arr[base + 2] ?? 0;
      // Farther (|z| large) = slower. Depth scale in [0.2, 1].
      const depthScale = Math.max(0.2, 1 - Math.abs(z) / 10);
      const fx = phases[i * 4] ?? 0.5;
      const fy = phases[i * 4 + 1] ?? 0.5;
      const px = phases[i * 4 + 2] ?? 0;
      const py = phases[i * 4 + 3] ?? 0;
      // Figure-8 Lissajous (2:1 frequency ratio).
      const ax = arr[base] ?? 0;
      const ay = arr[base + 1] ?? 0;
      arr[base] = ax + Math.sin(t * fx + px) * 0.0008 * depthScale;
      arr[base + 1] = ay + Math.sin(t * fy * 2 + py) * 0.0004 * depthScale;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={size}
        sizeAttenuation
        depthWrite={false}
        opacity={0.65}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// ─── Layer: orbs ──────────────────────────────────────────────────────────

interface OrbSpec {
  color: THREE.Color;
  opacity: number;
  position: [number, number, number];
  radius: number;
  loopSeconds: number;
  mode: "orbit" | "pulse";
}

function Orb({ spec }: { spec: OrbSpec }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);
  const accumRef = useRef(0);
  const basePos = spec.position;

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    accumRef.current += delta;
    if (accumRef.current < FRAME_INTERVAL) return;
    timeRef.current += accumRef.current;
    accumRef.current = 0;

    const phase = (timeRef.current % spec.loopSeconds) / spec.loopSeconds;
    const angle = phase * Math.PI * 2;

    if (spec.mode === "pulse") {
      // 0.95 → 1.05 breathing, sin ranges [-1, 1]
      const s = 1 + Math.sin(angle) * 0.05;
      meshRef.current.scale.setScalar(s);
    } else {
      // Slow circular drift around the base position
      meshRef.current.position.x = basePos[0] + Math.cos(angle) * 0.9;
      meshRef.current.position.y = basePos[1] + Math.sin(angle) * 0.9;
    }
  });

  return (
    <mesh ref={meshRef} position={spec.position}>
      <sphereGeometry args={[spec.radius, 8, 8]} />
      <meshBasicMaterial
        color={spec.color}
        transparent
        opacity={spec.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Layer: perspective grid floor ────────────────────────────────────────

function GridFloor() {
  const linesRef = useRef<THREE.LineSegments>(null);
  const timeRef = useRef(0);
  const accumRef = useRef(0);

  const geometry = useMemo(() => {
    const size = 20;
    const spacing = 1;
    const half = size / 2;
    const positions: number[] = [];
    for (let i = -half; i <= half; i++) {
      positions.push(-half, 0, i * spacing, half, 0, i * spacing);
      positions.push(i * spacing, 0, -half, i * spacing, 0, half);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame((_state, delta) => {
    if (!linesRef.current) return;
    accumRef.current += delta;
    if (accumRef.current < FRAME_INTERVAL) return;
    timeRef.current += accumRef.current;
    accumRef.current = 0;
    // Scroll forward — loop over 8 seconds, one grid cell per loop.
    const phase = (timeRef.current % 8) / 8;
    linesRef.current.position.z = phase - 0.5;
  });

  return (
    <lineSegments
      ref={linesRef}
      rotation={[-Math.PI / 3, 0, 0]}
      position={[0, -3, 0]}
      geometry={geometry}
    >
      <lineBasicMaterial
        color={WHITE}
        transparent
        opacity={0.025}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// ─── Mouse parallax wrapper ───────────────────────────────────────────────

function MouseParallax({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const MAX_ANGLE = Math.PI / 45; // 4 degrees

  useFrame((state) => {
    if (!groupRef.current) return;
    const targetY = state.pointer.x * MAX_ANGLE;
    const targetX = -state.pointer.y * MAX_ANGLE;
    // Lerp toward target — smooth lag, ~0.05 gives a pleasant 300ms feel.
    groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.05;
    groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.05;
  });

  return <group ref={groupRef}>{children}</group>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

function Scene({ animated }: { animated: boolean }) {
  const accent = readRgb("--accent-rgb", new THREE.Color("#22D3EE"));
  const accent2 = readRgb("--accent-2-rgb", new THREE.Color("#7C3AED"));

  const orbs: OrbSpec[] = useMemo(
    () => [
      { color: accent, opacity: 0.04, position: [-3.5, 2, -4], radius: 1.8, loopSeconds: 12, mode: "orbit" },
      { color: accent2, opacity: 0.03, position: [3, -2, -5], radius: 2.0, loopSeconds: 18, mode: "orbit" },
      { color: WHITE, opacity: 0.02, position: [0, 0, -3], radius: 1.4, loopSeconds: 8, mode: "pulse" },
    ],
    [accent, accent2],
  );

  return (
    <MouseParallax>
      <GridFloor />
      {orbs.map((spec, i) => (
        <Orb key={i} spec={spec} />
      ))}
      <ParticleLayer size={0.003} count={SMALL_COUNT} seed={0xa1} animated={animated} colorMix="accent" />
      <ParticleLayer size={0.008} count={LARGE_COUNT} seed={0xb2} animated={animated} colorMix="accent-2" />
    </MouseParallax>
  );
}

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
    // Static fallback — particles only, no motion, dim.
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-20"
      >
        <Canvas
          camera={{ position: [0, 0, 4.5], fov: 60 }}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ alpha: true, powerPreference: "low-power" }}
        >
          <Suspense fallback={null}>
            <ParticleLayer
              size={0.003}
              count={SMALL_COUNT}
              seed={0xa1}
              animated={false}
              colorMix="accent"
            />
          </Suspense>
        </Canvas>
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 60 }}
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <Suspense fallback={null}>
          <Scene animated />
        </Suspense>
      </Canvas>
    </div>
  );
}
