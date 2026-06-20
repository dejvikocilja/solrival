/**
 * Shared types for the SolRival battle verification engine.
 *
 * GameId uses kebab-case to decouple the verification layer from the DB enum
 * (CLASH_ROYALE / BRAWL_STARS). Use `toGameId` / `fromGameId` helpers in
 * `verification-engine.ts` when bridging between the two.
 */

export type GameId = 'clash-royale' | 'brawl-stars'

/**
 * Lifecycle states a duel verification can be in.
 *
 * - `pending`    — duel accepted, waiting for the battle to be played
 * - `verifying`  — poller is actively checking battle logs
 * - `verified`   — winner found and confirmed
 * - `disputed`   — auto-verification failed; requires manual review
 * - `timeout`    — polling window expired with no matching battle found
 * - `error`      — unrecoverable API or configuration error
 */
export type VerificationStatus =
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'disputed'
  | 'timeout'
  | 'error'

/**
 * All the context the engine needs to verify a specific duel.
 */
export interface DuelVerificationContext {
  /** Database duel ID (UUID). */
  duelId: string
  /** Which Supercell game was played. */
  gameId: GameId
  /**
   * The duel rule / game mode that must be matched in the battle log.
   * Examples: `'ladder'`, `'casual'`, `'ranked'`, `'knockout'`.
   */
  gameMode: string
  /** Supercell player tag for the duel creator — must include `#`. */
  player1Tag: string
  /** Supercell player tag for the opponent — must include `#`. */
  player2Tag: string
  /** The battle must have occurred *after* this timestamp. */
  acceptedAt: Date
  /**
   * The poller must stop after this timestamp regardless of whether a battle
   * was found. Typically `acceptedAt + DUEL_VALIDITY_WINDOW_MIN`.
   */
  timeoutAt: Date
}

/**
 * Normalised representation of a single battle, independent of which game
 * produced it.
 */
export interface BattleRecord {
  /** When the battle took place (from the API). */
  battleTime: Date
  /** Which game this record came from. */
  gameId: GameId
  /**
   * Normalised mode string used to match against `DuelVerificationContext.gameMode`.
   * The fetchers are responsible for mapping raw API strings to this value.
   */
  mode: string
  /** Supercell tag of the first player found in this battle. */
  player1Tag: string
  /** Supercell tag of the second player found in this battle. */
  player2Tag: string
  /**
   * Tag of the winner, or `null` for a draw.
   * Populated by the game-specific winner-extraction logic.
   */
  winnerTag: string | null
  /** Raw API response preserved verbatim for auditability / dispute review. */
  raw: unknown
}

/**
 * Final output of a verification attempt.
 */
export interface VerificationResult {
  /** Matches `DuelVerificationContext.duelId`. */
  duelId: string
  /** Current lifecycle status. */
  status: VerificationStatus
  /**
   * Winner's Supercell tag when `status === 'verified'`.
   * `null` for draws, disputes, timeouts, or errors.
   */
  winnerTag: string | null
  /** The matched battle record when `status === 'verified'`. */
  battle: BattleRecord | null
  /** When verification completed (any terminal status). */
  verifiedAt: Date | null
  /**
   * Human-readable reason for non-verified terminal states.
   * `null` when `status === 'verified'`.
   */
  failureReason: string | null
}
