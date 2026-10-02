import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";

/**
 * Applies the stored theme before first paint so the page never flashes the
 * wrong background. Kept as a tiny inline script for that reason.
 */
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem("lln-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored ? stored === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", dark);
  } catch (error) {
    /* private mode: fall back to the light default */
  }
})();
`.trim();

export const metadata: Metadata = {
  title: "Law of Large Numbers Visualizer",
  description:
    "Flip millions of coins with different random number generators and watch the proportion of heads converge to 0.5 — or fail to.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#14161f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
