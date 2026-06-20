import "server-only";

/**
 * Server-side auth configuration. Validates required secrets at module load so
 * misconfiguration fails fast rather than at first request.
 */

function required(name: string, value: string | undefined, minLen = 1): string {
  if (!value || value.length < minLen) {
    throw new Error(
      `Missing/invalid env ${name} (expected length >= ${minLen}). Check apps/web/.env.local.`,
    );
  }
  return value;
}

export const authConfig = {
  jwtSecret: required("AUTH_JWT_SECRET", process.env.AUTH_JWT_SECRET, 32),
  domain: required("SIWS_DOMAIN", process.env.SIWS_DOMAIN ?? "localhost"),
  appUrl: required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  cluster: (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta",
  /** comma-separated wallet addresses granted ADMIN on creation/login. */
  adminAllowlist: (process.env.ADMIN_WALLET_ALLOWLIST ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean),
} as const;

export const SESSION_COOKIE = "solrival_session";

/** Encoded secret for jose (HS256). */
export const jwtSecretKey = new TextEncoder().encode(authConfig.jwtSecret);
