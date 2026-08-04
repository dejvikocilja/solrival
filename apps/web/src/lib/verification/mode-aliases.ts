/**
 * Reads the alias list out of a duel rule's `verificationConfig` JSON.
 *
 * Lives in its own module — free of Prisma, env, and Solana imports — so the
 * policy can be unit-tested directly. Pulling it from the verification entry
 * point would drag the whole runtime config chain into the test.
 *
 * The column is untyped JSON written by seeds and admins, so every shape is
 * treated as untrusted: anything that isn't an array of non-empty strings
 * yields no aliases. A malformed config must degrade to "canonical mode only",
 * never throw — an exception here would stall verification for duels holding
 * real stakes.
 */
export function readModeAliases(config: unknown): string[] {
  if (typeof config !== 'object' || config === null) return []
  const raw = (config as { gameMode?: unknown }).gameMode
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}
