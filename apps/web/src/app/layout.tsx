import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/pwa";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "StyleMe",
  description: "Une belle photo pour chaque occasion.",
  applicationName: "StyleMe",
  appleWebApp: { capable: true, title: "StyleMe", statusBarStyle: "default" },
  icons: { icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }], apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: "#F4EEE4",
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
