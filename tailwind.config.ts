import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          mute: "#64748b",
        },
        canvas: "#eef1f6",
        surface: "#ffffff",
        line: "#e2e8f0",
        accent: {
          DEFAULT: "#0f766e",
          soft: "#ccfbf1",
        },
        danger: {
          DEFAULT: "#b91c1c",
          soft: "#fee2e2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
        lift: "0 2px 4px rgba(15, 23, 42, 0.04), 0 16px 40px rgba(15, 23, 42, 0.08)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      backgroundImage: {
        "app-glow":
          "radial-gradient(1200px 600px at 10% -10%, rgba(13, 148, 136, 0.09), transparent 55%), radial-gradient(900px 500px at 100% 0%, rgba(30, 58, 138, 0.08), transparent 50%), linear-gradient(180deg, #e8edf5 0%, #f3f5f9 40%, #eef1f6 100%)",
        "login-glow":
          "radial-gradient(800px 500px at 20% 20%, rgba(13, 148, 136, 0.22), transparent 55%), radial-gradient(700px 480px at 85% 15%, rgba(56, 189, 248, 0.12), transparent 50%), linear-gradient(145deg, #0b1220 0%, #132033 48%, #0f1a2a 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s ease-out both",
        "soft-pulse": "soft-pulse 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
