import type { Config } from "tailwindcss";
import preset from "@solrival/config/tailwind/preset";

// Design tokens (dark-first, fintech/esports) live in the shared preset.
export default {
  presets: [preset],
  // Single-level package glob: `packages/*/src` cannot descend into any
  // package's node_modules (which would need packages/*/node_modules/*/src),
  // avoiding Tailwind's full-node_modules scan warning.
  content: ["./src/**/*.{ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
} satisfies Config;
