import type { Config } from "tailwindcss";

/**
 * SolRival design tokens — dark-first, premium esports + fintech.
 * Colors are HSL channel triplets (see globals.css) consumed as
 * `hsl(var(--token) / <alpha-value>)` so Tailwind opacity utilities work.
 *
 * Accent system is functional, not decorative:
 *   rival   = primary action (challenge / accept)
 *   victory = money & positive outcomes (reward, win)
 *   ember   = time pressure (expiring soon)
 *   cr / bs = per-game identity rails in the feed
 */
const preset: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        "bg-raised": "hsl(var(--bg-raised) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-2": "hsl(var(--surface-2) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        fg: "hsl(var(--fg) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        faint: "hsl(var(--faint) / <alpha-value>)",
        rival: {
          DEFAULT: "hsl(var(--rival) / <alpha-value>)",
          fg: "hsl(var(--rival-fg) / <alpha-value>)",
        },
        victory: "hsl(var(--victory) / <alpha-value>)",
        ember: "hsl(var(--ember) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        cr: "hsl(var(--cr) / <alpha-value>)",
        bs: "hsl(var(--bs) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -16px rgba(0,0,0,0.7)",
        "card-hover": "0 1px 2px rgba(0,0,0,0.4), 0 18px 40px -18px rgba(0,0,0,0.8)",
        glow: "0 0 0 1px hsl(var(--rival) / 0.45), 0 10px 36px -10px hsl(var(--rival) / 0.5)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ember-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "ember-pulse": "ember-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default preset;
