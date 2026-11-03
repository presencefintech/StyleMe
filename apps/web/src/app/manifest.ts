import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StyleMe",
    short_name: "StyleMe",
    description: "Une belle photo pour chaque occasion.",
    lang: "fr",
    start_url: "/enhance",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: "#6C4CE0",
    categories: ["photo", "lifestyle"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Occasions", url: "/enhance" },
      { name: "Retoucher", url: "/edit" },
      { name: "Crédits", url: "/credits" },
    ],
  };
}
