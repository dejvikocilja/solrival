/**
 * Centralised environment-variable validation — validated LAZILY, per variable.
 *
 * Each variable is checked the first time it is read, not when this module is
 * imported. This keeps features independent: a missing Supercell token must
 * never break deposits, withdrawals, or admin actions whose import graphs
 * merely pass through this file. (The eager version did exactly that — any
 * route transitively importing `env` crashed at module evaluation if ANY
 * required var was absent.)
 *
 * Production still fails loudly at boot: `instrumentation.ts` calls
 * `validateEnv()` on server start, which touches every variable.
 *
 * Usage (unchanged):
 *   import { env } from '@/lib/env'
 *   const token = env.CLASH_ROYALE_API_TOKEN   // throws here iff missing
 *
 * Next.js `NEXT_PUBLIC_*` variables are included because they are embedded at
 * build time and available on both client and server.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[env] Missing required environment variable: ${name}\n` +
        'Check your .env.local against apps/web/.env.example.',
    )
  }
  return value
}

function optional(value: string | undefined, fallback: string): string {
  return value && value.trim() !== '' ? value : fallback
}

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface Env {
  // Database
  DATABASE_URL: string
  DIRECT_URL: string
  // Auth
  AUTH_JWT_SECRET: string
  SIWS_DOMAIN: string
  ADMIN_WALLET_ALLOWLIST: string
  // Realtime / internal
  INTERNAL_API_SECRET: string
  EXPIRE_CRON_SECRET: string
  VERIFY_CRON_SECRET: string
  WITHDRAWAL_CRON_SECRET: string
  // Supercell game APIs
  CLASH_ROYALE_API_TOKEN: string
  CLASH_ROYALE_API_BASE_URL: string
  BRAWL_STARS_API_TOKEN: string
  BRAWL_STARS_API_BASE_URL: string
  // Verification tuning
  VERIFICATION_POLL_INTERVAL_MS: number
  // App URL
  NEXT_PUBLIC_APP_URL: string
  // Solana / on-chain
  NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID: string
  // Credits / custody
  NEXT_PUBLIC_TREASURY_WALLET: string
  TREASURY_SECRET_KEY: string
  DEPOSIT_FEE_BPS: number
  REFERRAL_REWARD_BPS: number
}

// ─── Per-variable resolvers (each runs on first read of its variable) ─────────

const resolvers: { [K in keyof Env]: () => Env[K] } = {
  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: () => required('DATABASE_URL', process.env['DATABASE_URL']),
  DIRECT_URL: () => optional(process.env['DIRECT_URL'], process.env['DATABASE_URL'] ?? ''),

  // ── Auth ──────────────────────────────────────────────────────────────────
  AUTH_JWT_SECRET: () => required('AUTH_JWT_SECRET', process.env['AUTH_JWT_SECRET']),

  /** Domain used for Sign-In With Solana challenge messages. */
  SIWS_DOMAIN: () =>
    process.env['NODE_ENV'] === 'production'
      ? required('SIWS_DOMAIN', process.env['SIWS_DOMAIN'])
      : optional(process.env['SIWS_DOMAIN'], 'localhost'),

  /** Comma-separated list of wallet addresses that receive ADMIN role on login. */
  ADMIN_WALLET_ALLOWLIST: () => optional(process.env['ADMIN_WALLET_ALLOWLIST'], ''),

  // ── Realtime / internal ───────────────────────────────────────────────────
  INTERNAL_API_SECRET: () => required('INTERNAL_API_SECRET', process.env['INTERNAL_API_SECRET']),
  /** Protects the benign duel-expiry cron. */
  EXPIRE_CRON_SECRET: () => required('EXPIRE_CRON_SECRET', process.env['EXPIRE_CRON_SECRET']),
  /** Dedicated secret for the verification sweep (it triggers settlements, so
   *  it warrants isolation). Falls back to EXPIRE_CRON_SECRET when unset for
   *  backward compatibility — set it to complete the isolation. */
  VERIFY_CRON_SECRET: () =>
    optional(process.env['VERIFY_CRON_SECRET'], process.env['EXPIRE_CRON_SECRET'] ?? ''),
  /** Dedicated secret for the treasury payout worker — kept separate from the
   *  duel crons so a leak of one keeper token can't move real funds. */
  WITHDRAWAL_CRON_SECRET: () =>
    required('WITHDRAWAL_CRON_SECRET', process.env['WITHDRAWAL_CRON_SECRET']),

  // ── Supercell game APIs ───────────────────────────────────────────────────
  CLASH_ROYALE_API_TOKEN: () =>
    required('CLASH_ROYALE_API_TOKEN', process.env['CLASH_ROYALE_API_TOKEN']),
  CLASH_ROYALE_API_BASE_URL: () =>
    optional(process.env['CLASH_ROYALE_API_BASE_URL'], 'https://api.clashroyale.com/v1'),

  BRAWL_STARS_API_TOKEN: () =>
    required('BRAWL_STARS_API_TOKEN', process.env['BRAWL_STARS_API_TOKEN']),
  BRAWL_STARS_API_BASE_URL: () =>
    optional(process.env['BRAWL_STARS_API_BASE_URL'], 'https://api.brawlstars.com/v1'),

  // ── Verification tuning ───────────────────────────────────────────────────
  VERIFICATION_POLL_INTERVAL_MS: () =>
    parseInt(optional(process.env['VERIFICATION_POLL_INTERVAL_MS'], '30000'), 10),

  // ── App URL ───────────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: () =>
    optional(process.env['NEXT_PUBLIC_APP_URL'], 'http://localhost:3000'),

  // ── Solana / on-chain ─────────────────────────────────────────────────────
  /** Deployed escrow program id — must be the real id, never the CLI placeholder. */
  NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID: () =>
    required('NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID', process.env['NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID']),

  // ── Credits / custody ─────────────────────────────────────────────────────
  /** Public treasury address users deposit SOL into (also a NEXT_PUBLIC_ var). */
  NEXT_PUBLIC_TREASURY_WALLET: () =>
    required('NEXT_PUBLIC_TREASURY_WALLET', process.env['NEXT_PUBLIC_TREASURY_WALLET']),
  /** Treasury secret key (base58 or JSON byte array) — signs withdrawal payouts.
   *  Required only in the payout worker; optional elsewhere so web can boot. */
  TREASURY_SECRET_KEY: () => optional(process.env['TREASURY_SECRET_KEY'], ''),

  /** Deposit fee in bps (the platform's only fee). Default 2%. */
  DEPOSIT_FEE_BPS: () => parseInt(optional(process.env['NEXT_PUBLIC_DEPOSIT_FEE_BPS'], '50'), 10),
  /** Referrer reward in bps of a referee's first deposit. Default 5%. */
  REFERRAL_REWARD_BPS: () =>
    parseInt(optional(process.env['NEXT_PUBLIC_REFERRAL_REWARD_BPS'], '500'), 10),
}

// ─── Lazy, memoised accessor object (same `env.X` API as before) ──────────────

// Note: we do NOT import 'server-only' here to allow the file to be imported
// in middleware and instrumentation contexts; secrets are never in NEXT_PUBLIC_.
export const env = {} as Env

for (const key of Object.keys(resolvers) as Array<keyof Env>) {
  let cached: Env[keyof Env]
  let resolved = false
  Object.defineProperty(env, key, {
    enumerable: true,
    get() {
      if (!resolved) {
        cached = resolvers[key]()
        resolved = true
      }
      return cached
    },
  })
}

/**
 * Touches every variable, throwing on the first missing required one.
 * Called from instrumentation.ts at production boot so a misconfigured deploy
 * fails immediately — the eager behaviour, restored where it belongs.
 */
export function validateEnv(): void {
  const missing: string[] = []
  for (const key of Object.keys(resolvers) as Array<keyof Env>) {
    try {
      void env[key]
    } catch {
      missing.push(key)
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variable(s): ${missing.join(', ')}\n` +
        'Check your deployment configuration against apps/web/.env.example.',
    )
  }
}
