import type { Metadata } from "next";
import { Inter, Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "../src/providers/Providers";
import { AppLayout } from "../components/layout/AppLayout";
import { ParticleFieldLoader } from "../components/shared/ParticleFieldLoader";

const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});
const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "YieldPilot — DeFi Yield Management",
  description: "Deposit, delegate, and track yield strategies from one dashboard.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${ui.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <ParticleFieldLoader />
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
