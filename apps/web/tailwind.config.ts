import type { Config } from "tailwindcss";

// Tokens du design system (STYLEME_ARCHITECTURE.md §10) — jamais de hex en dur dans les composants.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6C4CE0", dark: "#4B32A8" },
        accent: "#F2B705",
        coral: "#FF6B6B",
        bg: { DEFAULT: "#0E1020", surface: "#1A1D33", alt: "#242845" },
        ink: { DEFAULT: "#F5F6FB", muted: "#A7ADC9" },
        line: "#2E3350",
        success: "#2FBF71",
        warning: "#F2B705",
        danger: "#FF5470",
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      fontSize: {
        display: ["28px", "34px"],
        h1: ["22px", "28px"],
        h2: ["18px", "24px"],
        body: ["15px", "22px"],
        caption: ["13px", "18px"],
        tiny: ["11px", "14px"],
      },
      spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px" },
      borderRadius: { sm: "8px", md: "12px", lg: "20px", pill: "999px" },
      backgroundImage: { signature: "linear-gradient(135deg, #6C4CE0 0%, #9A6CF0 100%)" },
      boxShadow: { card: "0 8px 24px rgba(0,0,0,0.25)" },
    },
  },
  plugins: [],
};
export default config;
