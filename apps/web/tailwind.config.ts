import type { Config } from "tailwindcss";

// Design tokens. Les couleurs viennent de variables CSS (globals.css) : thème clair par défaut,
// thème sombre automatique (prefers-color-scheme). Jamais de couleur en dur dans les composants.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v("primary"), dark: v("primary-dark") },
        accent: { DEFAULT: v("accent"), ink: v("accent-ink") },
        coral: v("coral"),
        bg: { DEFAULT: v("bg"), surface: v("surface"), alt: v("alt") },
        ink: { DEFAULT: v("ink"), muted: v("muted") },
        line: v("line"),
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: {
        hero: ["clamp(2.5rem, 6vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        display: ["2rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        h1: ["1.5rem", "1.9rem"],
        h2: ["1.125rem", "1.5rem"],
        body: ["0.9375rem", "1.4rem"],
        caption: ["0.8125rem", "1.15rem"],
        tiny: ["0.6875rem", "0.9rem"],
      },
      spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px" },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px", pill: "999px" },
      backgroundImage: { signature: "linear-gradient(135deg, #6C4CE0 0%, #9A6CF0 100%)" },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 12px 28px -16px rgb(var(--shadow) / 0.28)",
        glow: "0 12px 30px -12px rgb(108 76 224 / 0.65)",
      },
    },
  },
  plugins: [],
};
export default config;
