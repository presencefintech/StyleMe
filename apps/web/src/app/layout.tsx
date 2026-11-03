import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/pwa";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "StyleMe",
  description: "Une belle photo pour chaque occasion.",
  applicationName: "StyleMe",
  appleWebApp: { capable: true, title: "StyleMe", statusBarStyle: "default" },
  icons: { icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }], apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6C4CE0" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1020" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
