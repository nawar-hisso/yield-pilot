import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "../src/providers/Providers";
import { AppShell } from "../components/layout/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "YieldPilot — DeFi Yield Management",
  description: "Deposit, delegate, and track yield strategies from one dashboard.",
};

// Wallet connect + passkey provider trees rely on browser-only APIs
// (navigator.credentials, IndexedDB, Reown modal). Skip static generation.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
