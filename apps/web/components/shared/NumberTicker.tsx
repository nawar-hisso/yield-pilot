"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

export interface NumberTickerProps {
  value: number;
  /** Format the interpolated number before rendering. Default: toLocaleString with up to 2 fractions. */
  format?: (n: number) => string;
  /** Characters rendered before/after the number (e.g. "$", "%"). */
  prefix?: string;
  suffix?: string;
  /** Spring stiffness. Lower = slower. */
  stiffness?: number;
  damping?: number;
  className?: string;
}

const defaultFormat = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Smoothly animates a numeric display from 0 → value when it first enters view, and re-runs whenever `value` changes. Respects prefers-reduced-motion via framer-motion's built-in handling. */
export function NumberTicker({
  value,
  format = defaultFormat,
  prefix,
  suffix,
  stiffness = 90,
  damping = 28,
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  const motion = useMotionValue(0);
  const spring = useSpring(motion, { stiffness, damping, mass: 1 });

  useEffect(() => {
    if (inView) motion.set(value);
  }, [inView, value, motion]);

  useEffect(() => {
    return spring.on("change", (latest) => {
      if (!ref.current) return;
      ref.current.textContent = `${prefix ?? ""}${format(latest)}${suffix ?? ""}`;
    });
  }, [spring, format, prefix, suffix]);

  return (
    <span ref={ref} className={`font-mono tabular-nums ${className ?? ""}`}>
      {`${prefix ?? ""}${format(0)}${suffix ?? ""}`}
    </span>
  );
}
