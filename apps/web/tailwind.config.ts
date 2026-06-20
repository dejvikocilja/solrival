import type { Config } from "tailwindcss";
import preset from "@solrival/config/tailwind/preset";

// Design tokens (dark-first, fintech/esports) live in the shared preset.
export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/**/src/**/*.{ts,tsx}"],
} satisfies Config;
