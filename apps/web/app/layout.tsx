import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "../src/providers/Providers";
import { AppLayout } from "../components/layout/AppLayout";
import { ParticleFieldLoader } from "../components/shared/ParticleFieldLoader";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Geist Mono ships as a variable font via the `geist` package.
// Its `variable` is already `--font-geist-mono`; we alias on body className.
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "YieldPilot — DeFi Yield Management",
  description: "Deposit, delegate, and track yield strategies from one dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jakarta.variable} ${geistMono.variable}`}
        style={{ ["--font-mono" as string]: "var(--font-geist-mono)" }}
      >
        <ParticleFieldLoader />
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
