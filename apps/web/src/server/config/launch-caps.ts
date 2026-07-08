import "server-only";

/**
 * Launch caps — operational blast-radius limits, distinct from the absolute
 * schema ceilings in @solrival/shared (1000 SOL), which exist only to reject
 * absurd input. These caps bound how much value any single duel or any single
 * day of withdrawals can put at risk while the platform is young: a settlement
 * bug, a compromised account, or a hot-treasury drain is then capped at a
 * known, survivable number.
 *
 * Both are env-tunable so they can be raised gradually (mainnet plan: start
 * low, raise as the ledger keeps reconciling) without a deploy-time code
 * change. Values are read per-request, so changing the env + restarting is
 * enough.
 *
 *   LAUNCH_MAX_STAKE_SOL               per-player stake ceiling per duel (default 5)
 *   LAUNCH_MAX_WITHDRAWAL_SOL_PER_DAY  per-user rolling-24h withdrawal ceiling (default 50)
 *
 * Setting either to 0 disables that cap (falls back to the schema ceiling) —
 * intended only for devnet testing.
 */

const LAMPORTS_PER_SOL = 1_000_000_000n;

function solEnvToLamports(name: string, defaultSol: number): bigint | null {
  const raw = process.env[name];
  const sol = raw !== undefined && raw !== "" ? Number(raw) : defaultSol;
  if (!Number.isFinite(sol) || sol < 0) return BigInt(defaultSol) * LAMPORTS_PER_SOL;
  if (sol === 0) return null; // explicitly disabled
  // Support fractional SOL (e.g. 0.5) without float lamport drift.
  return BigInt(Math.round(sol * 1_000)) * (LAMPORTS_PER_SOL / 1_000n);
}

/** Max per-player stake for a new duel, in lamports; null = uncapped. */
export function launchMaxStakeLamports(): bigint | null {
  return solEnvToLamports("LAUNCH_MAX_STAKE_SOL", 5);
}

/** Max total withdrawals per user per rolling 24h, in lamports; null = uncapped. */
export function launchMaxWithdrawalPerDayLamports(): bigint | null {
  return solEnvToLamports("LAUNCH_MAX_WITHDRAWAL_SOL_PER_DAY", 50);
}

/** Human-readable SOL string for error messages (trims trailing zeros). */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(9, "0").replace(/0+$/, "")}`;
}
