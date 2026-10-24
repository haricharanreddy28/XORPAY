import type { Config } from "tailwindcss";

// Mirrors the xorpay_ui brand tokens (spec §7.10 — shared theme).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { primary: "#6C2BD9", secondary: "#2563EB", accent: "#A855F7" },
        bg: { base: "#0B0A12", surface: "#15131F" },
        line: "#2A2640",
        muted: "#A9A4BF",
        ok: "#32D583",
        warn: "#FDB022",
        err: "#F97066",
      },
    },
  },
  plugins: [],
};

export default config;
