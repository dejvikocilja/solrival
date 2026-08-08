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
 * If multiple matching battles exist, the EARLIEST unclaimed one is returned —
 * see the note in findMatchingBattle. Returning the most recent allowed a loser
 * to replay and overwrite the result before the sweep ran.
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
function modeMatches(
  battle: BattleRecord,
  expectedMode: string,
  aliases?: readonly string[],
): boolean {
  const actual = normalizeGameMode(battle.mode)
  if (actual === normalizeGameMode(expectedMode)) return true
  // Aliases are consulted only after the canonical mode fails, so behaviour for
  // every existing rule (which has no aliases) is byte-for-byte unchanged.
  if (!aliases) return false
  return aliases.some((a) => normalizeGameMode(a) === actual)
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
  const { gameId, gameMode, gameModeAliases, player1Tag, player2Tag, acceptedAt } = ctx

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
    if (!modeMatches(p1Battle, gameMode, gameModeAliases)) continue

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

  // EARLIEST valid battle wins — never the most recent.
  //
  // This previously took the newest candidate, which was exploitable: the
  // verification sweep runs on a timer, so a player who lost could immediately
  // play a second friendly in the same mode, win that one, and have the sweep
  // settle the duel on the later battle. Taking the earliest removes the
  // re-roll: the first battle both players played after accepting is the one
  // they agreed to, and nothing played afterwards can displace it.
  candidates.sort((a, b) => a.battleTime.getTime() - b.battleTime.getTime())

  // M-005: deduplicate battles across duels.
  // A stable key from battle timestamp + both player tags, so one real-world
  // battle cannot settle two different duels.
  const keyFor = (b: BattleRecord) =>
    [b.battleTime.toISOString(), normTag(b.player1Tag), normTag(b.player2Tag)].join(':')

  // Fetch every claim in one query rather than per-candidate, then walk the
  // candidates in chronological order and take the first unclaimed one.
  //
  // Walking (rather than testing only the earliest) matters when the same two
  // players legitimately play several duels in one window — back-to-back
  // tournament matches, or a rematch. Duel A claims the first battle; duel B
  // must then settle on the SECOND. Testing only the earliest would find it
  // claimed and give up, leaving duel B permanently unverifiable.
  const candidateKeys = candidates.map(keyFor)
  const claims = await prisma.verificationJob.findMany({
    where: {
      detectedBattleId: { in: candidateKeys },
      duelId: { not: ctx.duelId },
    },
    select: { detectedBattleId: true, duelId: true },
  })
  const claimedBy = new Map(
    claims
      .filter((c): c is { detectedBattleId: string; duelId: string } => c.detectedBattleId !== null)
      .map((c) => [c.detectedBattleId, c.duelId]),
  )

  let best: BattleRecord | undefined
  let battleKey = ''
  for (let i = 0; i < candidates.length; i++) {
    const key = candidateKeys[i]!
    const owner = claimedBy.get(key)
    if (owner === undefined) {
      best = candidates[i]
      battleKey = key
      break
    }
    console.warn({
      msg: 'verification_engine_battle_already_claimed',
      battleKey: key,
      claimedByDuelId: owner,
      currentDuelId: ctx.duelId,
    })
  }

  if (!best) {
    console.info({
      msg: 'verification_engine_all_candidates_claimed',
      duelId: ctx.duelId,
      totalCandidates: candidates.length,
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
