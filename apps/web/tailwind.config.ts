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
        hero: ["clamp(2.5rem, 6vw, 4rem)", { lineHeight: "1.04", letterSpacing: "-0.02em" }],
        display: ["2.125rem", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        h1: ["1.5rem", "1.9rem"],
        h2: ["1.125rem", "1.5rem"],
        body: ["0.9375rem", "1.4rem"],
        caption: ["0.8125rem", "1.15rem"],
        tiny: ["0.6875rem", "0.9rem"],
      },
      spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px" },
      // Studio : angles droits. "pill" ne sert qu'aux pastilles rondes (points, spinners).
      borderRadius: { sm: "0px", md: "0px", lg: "0px", xl: "0px", pill: "999px" },
      boxShadow: {
        // Pas d'ombres décoratives : la hiérarchie vient des filets et de l'espace.
        card: "none",
        glow: "none",
      },
    },
  },
  plugins: [],
};
export default config;
