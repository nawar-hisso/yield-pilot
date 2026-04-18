// YieldPilot — mandate-compliant token map.
// All color literals live in app/globals.css. This file only wires names.

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans:    ["var(--font-ui)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-ui)", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // shadcn tokens (downstream components)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          muted: "hsl(var(--card-muted))",
        },
        brand: {
          violet: "hsl(var(--violet))",
          fuchsia: "hsl(var(--fuchsia))",
          lime: "hsl(var(--lime))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",

        // mandate tokens — map to the CSS vars in :root
        base:         "var(--color-base)",
        surface:      "var(--color-surface)",
        "card-hover": "var(--color-card-hover)",
        "border-mid": "var(--color-border-mid)",
        "border-glow": "var(--color-border-glow)",
        "accent-dim": "var(--color-accent-dim)",
        "accent-glow": "var(--color-accent-glow)",
        "accent-2":   "var(--color-accent-2)",
        gold:         "var(--color-gold)",
        text1:        "var(--color-text-1)",
        text2:        "var(--color-text-2)",
        text3:        "var(--color-text-3)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        glow:
          "0 0 0 1px rgb(var(--accent-rgb) / 0.15), 0 12px 40px -16px rgb(var(--accent-rgb) / 0.35)",
        "glow-violet":
          "0 0 0 1px rgb(var(--accent-2-rgb) / 0.20), 0 16px 48px -18px rgb(var(--accent-2-rgb) / 0.40)",
      },
      transitionTimingFunction: {
        "out-quart": "var(--ease-out-quart)",
        back: "var(--ease-back)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "fade-in":  { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up":  {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgb(var(--accent-rgb) / 0.20)" },
          "50%":      { boxShadow: "0 0 28px rgb(var(--accent-rgb) / 0.50)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-in":    "fade-in 200ms ease-out",
        "fade-up":    "fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up":   "slide-up 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer:      "shimmer 1.4s linear infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        float:        "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
