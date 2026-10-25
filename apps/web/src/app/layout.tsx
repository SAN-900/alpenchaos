import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlpenChaos",
  description: "Break Solana consensus and watch Alpenglow finalize anyway. An interactive finality simulator.",
  icons: {
    icon: "/Alpenchaos.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <nav className="nav" aria-label="Main navigation">
            <Link href="/" className="brand" aria-label="AlpenChaos home">
              <span className="brand-mark" aria-hidden="true">A</span>
              alpen<b>chaos</b>
            </Link>
            <div className="nav-links">
              <Link href="/scenarios" className="nav-link">Scenarios</Link>
              <Link href="/play" className="nav-link">Play vs bot</Link>
              <Link href="/arena" className="nav-link">Online arena</Link>
              <Link href="/scores" className="nav-link">Scores</Link>
              <Link href="/replays" className="nav-link">Replays</Link>
              <Link href="/live" className="nav-link">Live Network</Link>
              <Link href="/" className="nav-link">About</Link>
            </div>
            <Link href="/scenarios" className="nav-cta">Explore simulations <span aria-hidden="true">↗</span></Link>
          </nav>
          {children}
          <footer className="site-footer">
            <Link href="/" className="footer-brand">alpen<b>chaos</b></Link>
            <span>Deterministic consensus simulations. No real network is touched.</span>
            <div><Link href="/">About</Link></div>
          </footer>
        </div>
      </body>
    </html>
  );
}
