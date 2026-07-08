/**
 * Duel pot economics — the single source of truth for how a stake becomes a
 * pot, a rake, and a winner's reward. Pure bigint math, shared by:
 *
 *   • duel creation/accept responses (economics preview shown to players)
 *   • settlement (winner paid `reward`, platform keeps `rake`)
 *   • post-settlement dispute reversal (overturn moves exactly `reward`
 *     between players; voiding returns `netWinnings` + the loser's stake)
 *
 * Everything downstream (ledger entries, UI breakdowns) derives from these
 * numbers, so the invariants here are load-bearing:
 *
 *   pot        = 2 × stake
 *   rake       = ⌊pot × feeBps / 10 000⌋   (floor division — platform never
 *                rounds in its own favour past the floor)
 *   reward     = pot − rake                (winner's gross payout)
 *   netWinnings = reward − stake           (winner's profit; loser's loss is
 *                exactly `stake`, so netWinnings + rake === stake)
 */

export interface DuelEconomics {
  /** Per-player stake, in lamports. */
  stake: bigint;
  /** Total pot (both stakes), in lamports. */
  pot: bigint;
  /** Platform rake taken from the pot, in lamports. */
  rake: bigint;
  /** Winner's gross payout (pot − rake), in lamports. */
  reward: bigint;
  /** Winner's profit beyond their own stake (reward − stake), in lamports. */
  netWinnings: bigint;
}

export const BPS_DENOMINATOR = 10_000n;

/**
 * Computes the full economics of a duel from its stake and rake.
 * @param stakeLamports per-player stake (must be >= 0)
 * @param feeBps platform rake in basis points (0–10 000)
 */
export function duelEconomics(stakeLamports: bigint, feeBps: number): DuelEconomics {
  if (stakeLamports < 0n) throw new RangeError("stake must be non-negative");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new RangeError("feeBps must be an integer in 0..10000");
  }
  const pot = stakeLamports * 2n;
  const rake = (pot * BigInt(feeBps)) / BPS_DENOMINATOR;
  const reward = pot - rake;
  return { stake: stakeLamports, pot, rake, reward, netWinnings: reward - stakeLamports };
}
