import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { RootErrorBoundary } from "@/components/providers/root-error-boundary";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SolRival — Competitive duels for real stakes", template: "%s · SolRival" },
  description:
    "Challenge players to skill-based 1v1 duels in Clash Royale and Brawl Stars, with stakes held in Solana escrow and payouts settled automatically.",
};

export const viewport: Viewport = {
  themeColor: "#08090D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <RootErrorBoundary>
          <AppProviders>
            <SkipLink />
            <SiteHeader />
            <div id="main-content" tabIndex={-1} className="outline-none">
              {children}
            </div>
            <MobileTabBar />
          </AppProviders>
        </RootErrorBoundary>
      </body>
    </html>
  );
}
