import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/pwa";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "StyleMe",
  description: "Une belle photo pour chaque occasion.",
  applicationName: "StyleMe",
  appleWebApp: { capable: true, title: "StyleMe", statusBarStyle: "default" },
  icons: { icon: [{ url: "/pwa-icon/192?v=2", sizes: "192x192", type: "image/png" }], apple: [{ url: "/pwa-icon/180?v=2", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: "#F6F6F3",
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
