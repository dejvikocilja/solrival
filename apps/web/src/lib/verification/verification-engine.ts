/**
 * Core verification engine.
 *
 * Orchestrates fetching battle logs from both players and finding the shared
 * battle that matches all four verification rules:
 *
 *  1. Both players appear in the same battle
 *  2. Battle used the correct game mode
 *  3. Battle timestamp is after the duel acceptance timestamp
 *  4. Battle belongs to the correct game
 *
 * If multiple matching battles exist, the most recent one is returned.
 */

import { prisma } from '@solrival/db'
import { normalizeGameMode } from './types'
import type { DuelVerificationContext, BattleRecord, GameId } from './types'
import { fetchClashRoyaleBattles } from './clash-royale'
import { fetchBrawlStarsBattles } from './brawl-stars'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Two battles are considered the same if their timestamps are within this window.
 * Reduced from 60s to 10s (M-005) — the Supercell API timestamp precision is
 * ~1 second; 10 seconds is a safe margin without risking false-positive matches
 * between distinct battles played close together.
 */
const BATTLE_TIME_TOLERANCE_MS = 10_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalises a player tag for comparison:
 * uppercased, always starts with `#`.
 */
function normTag(tag: string): string {
  return tag.toUpperCase().replace(/^#?/, '#')
}

/**
 * Returns `true` if the two tags refer to the same player.
 */
function tagsMatch(a: string, b: string): boolean {
  return normTag(a) === normTag(b)
}

/**
 * Returns `true` if both `tagA` and `tagB` appear (in either order) as the
 * player1 / player2 tags of `battle`.
 */
function battleInvolvesPlayers(
  battle: BattleRecord,
  tagA: string,
  tagB: string,
): boolean {
  const p1 = normTag(battle.player1Tag)
  const p2 = normTag(battle.player2Tag)
  const a = normTag(tagA)
  const b = normTag(tagB)
  return (p1 === a && p2 === b) || (p1 === b && p2 === a)
}

/**
 * Returns `true` when `battleA` and `battleB` share the same moment in time
 * within the ±10-second tolerance window.
 */
function battlesAreSameTime(battleA: BattleRecord, battleB: BattleRecord): boolean {
  const diff = Math.abs(battleA.battleTime.getTime() - battleB.battleTime.getTime())
  return diff <= BATTLE_TIME_TOLERANCE_MS
}

/**
 * Returns `true` if the battle mode matches the expected game mode.
 *
 * Both sides pass through normalizeGameMode so representation differences
 * ("gemGrab" vs "gem-grab" vs "Gem Grab") can never cause a false mismatch.
 */
function modeMatches(battle: BattleRecord, expectedMode: string): boolean {
  return normalizeGameMode(battle.mode) === normalizeGameMode(expectedMode)
}

/**
 * Maps the DB `game` enum values (`CLASH_ROYALE`, `BRAWL_STARS`) to the
 * verification engine's `GameId` kebab-case values.
 */
export function toGameId(dbGame: string): GameId {
  switch (dbGame.toUpperCase()) {
    case 'CLASH_ROYALE':
      return 'clash-royale'
    case 'BRAWL_STARS':
      return 'brawl-stars'
    default:
      throw new Error(`Unknown game identifier: "${dbGame}"`)
  }
}

/**
 * Maps a `GameId` back to the DB enum string.
 */
export function fromGameId(gameId: GameId): 'CLASH_ROYALE' | 'BRAWL_STARS' {
  switch (gameId) {
    case 'clash-royale':
      return 'CLASH_ROYALE'
    case 'brawl-stars':
      return 'BRAWL_STARS'
  }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetches all available battles for a given player from the appropriate game API.
 */
async function fetchBattles(
  gameId: GameId,
  playerTag: string,
): Promise<BattleRecord[]> {
  switch (gameId) {
    case 'clash-royale':
      return fetchClashRoyaleBattles(playerTag)
    case 'brawl-stars':
      return fetchBrawlStarsBattles(playerTag)
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Fetches battle logs for both players in the duel and finds the shared
 * battle that satisfies all four verification rules.
 *
 * Returns the matching `BattleRecord` (most recent if multiple found), or
 * `null` if no qualifying battle exists yet.
 *
 * @param ctx - Full duel verification context
 */
export async function findMatchingBattle(
  ctx: DuelVerificationContext,
): Promise<BattleRecord | null> {
  const { gameId, gameMode, player1Tag, player2Tag, acceptedAt } = ctx

  // Fetch both battle logs concurrently
  const [p1Battles, p2Battles] = await Promise.all([
    fetchBattles(gameId, player1Tag),
    fetchBattles(gameId, player2Tag),
  ])

  console.info({
    msg: 'verification_engine_battles_fetched',
    duelId: ctx.duelId,
    gameId,
    p1Count: p1Battles.length,
    p2Count: p2Battles.length,
  })

  const candidates: BattleRecord[] = []

  for (const p1Battle of p1Battles) {
    // Rule 4: correct game
    if (p1Battle.gameId !== gameId) continue

    // Rule 3: after acceptance
    if (p1Battle.battleTime.getTime() <= acceptedAt.getTime()) continue

    // Rule 2: correct game mode
    if (!modeMatches(p1Battle, gameMode)) continue

    // Rule 1: both players present in this battle
    if (!battleInvolvesPlayers(p1Battle, player1Tag, player2Tag)) continue

    // Cross-validate: find the same battle in p2's log (time-window match)
    const p2Match = p2Battles.find((p2Battle) => {
      if (p2Battle.gameId !== gameId) return false
      if (!battleInvolvesPlayers(p2Battle, player1Tag, player2Tag)) return false
      return battlesAreSameTime(p1Battle, p2Battle)
    })

    if (p2Match !== undefined) {
      // Use p1's record as the canonical source (it has p1's perspective for
      // winner extraction — brawl-stars result is always from p1's viewpoint).
      candidates.push(p1Battle)
    }
  }

  if (candidates.length === 0) {
    console.info({
      msg: 'verification_engine_no_match_found',
      duelId: ctx.duelId,
      gameId,
      gameMode,
    })
    return null
  }

  // Prefer most recent if multiple matches (shouldn't happen in practice)
  candidates.sort((a, b) => b.battleTime.getTime() - a.battleTime.getTime())

  const best = candidates[0]
  // candidates is guaranteed non-empty by the check above
  if (!best) return null

  // M-005: deduplicate battles across duels.
  // Compute a stable key from battle timestamp + both player tags so the same
  // real-world battle cannot settle two different duels.
  const battleKey = [
    best.battleTime.toISOString(),
    normTag(best.player1Tag),
    normTag(best.player2Tag),
  ].join(':')

  const alreadyClaimed = await prisma.verificationJob.findFirst({
    where: {
      detectedBattleId: battleKey,
      duelId: { not: ctx.duelId },
    },
    select: { duelId: true },
  })

  if (alreadyClaimed !== null) {
    console.warn({
      msg: 'verification_engine_battle_already_claimed',
      battleKey,
      claimedByDuelId: alreadyClaimed.duelId,
      currentDuelId: ctx.duelId,
    })
    return null
  }

  console.info({
    msg: 'verification_engine_match_found',
    duelId: ctx.duelId,
    battleTime: best.battleTime.toISOString(),
    winnerTag: best.winnerTag,
    battleKey,
    totalCandidates: candidates.length,
  })

  // Persist the battle key so subsequent calls for other duels can detect reuse.
  await prisma.verificationJob.updateMany({
    where: { duelId: ctx.duelId },
    data:  { detectedBattleId: battleKey },
  })

  return best
}
