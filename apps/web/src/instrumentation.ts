/**
 * Next.js instrumentation — runs once when the server boots.
 *
 * Restores fail-fast env validation where it belongs: a production deploy with
 * a missing required variable dies at startup with a complete list of what's
 * absent, instead of 500-ing on whichever route first touches it. Development
 * is deliberately exempt so features degrade independently while you fill in
 * credentials (e.g. Supercell tokens arriving later than Solana config).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
