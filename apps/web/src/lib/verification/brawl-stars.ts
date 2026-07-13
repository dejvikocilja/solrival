/**
 * Brawl Stars battle fetcher and winner extractor.
 *
 * Fetches the last 25 battles for a player via the official BS API and maps
 * them to the canonical `BattleRecord` shape used by the verification engine.
 *
 * The battlelog has TWO structural families (confirmed against a real
 * captured battlelog — see brawl-stars.test.ts):
 *
 *  • Team modes (gemGrab, brawlBall, knockout…): `battle.teams` — an array of
 *    team rosters — plus `battle.result` ("victory"/"defeat"/"draw") from the
 *    REQUESTING player's perspective. Friendly rooms where both duel players
 *    joined the SAME side come back as a single team containing both tags —
 *    such a battle has no head-to-head outcome and is skipped explicitly
 *    (the duel page instructs players to join opposite sides).
 *
 *  • Showdown modes: `battle.players` (flat list) plus `battle.rank` — the
 *    requesting player's final placement. A two-player showdown is a clean
 *    1v1 (rank 1 beat rank 2); bigger lobbies have no pairwise duel outcome.
 *
 * Every skipped battle is tallied by reason and logged, so `parsed: 0` in the
 * logs always says WHY.
 */

import type { BattleRecord } from './types'
import { normalizeGameMode } from './types'
import { supercellGet, encodePlayerTag } from './supercell-client'

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface BSBrawler {
  tag: string
  name?: string
}

interface BSTeamMember {
  tag: string
  name?: string
  brawler?: BSBrawler
}

interface BSBattleEntry {
  battleTime: string                       // compact ISO, e.g. "20260711T200040.000Z"
  event?: {
    id?: number
    mode?: string                          // e.g. "knockout", "gemGrab", "soloShowdown"
    map?: string
  }
  battle?: {
    mode?: string                          // sometimes differs from event.mode
    type?: string                          // "friendly" | "ranked" | …
    result?: 'victory' | 'defeat' | 'draw' // team modes; requester's perspective
    rank?: number                          // showdown modes; requester's placement
    teams?: BSTeamMember[][]               // team modes
    players?: BSTeamMember[]               // showdown modes
  }
}

/** Why a battlelog entry couldn't become a BattleRecord (tallied + logged). */
type SkipReason =
  | 'missing_battle_time'
  | 'bad_battle_time'
  | 'same_team'            // both duelists on one side — no "versus" to judge
  | 'requester_not_found'
  | 'multiplayer_showdown' // >2 players; no pairwise duel outcome
  | 'unrecognized_structure'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const norm = (t: string) => t.toUpperCase().replace(/^#?/, '#')

/**
 * Parses the BS battleTime string (ISO-like, no separators) into a Date.
 * Format: `YYYYMMDDTHHmmss.sssZ`
 */
function parseBattleTime(raw: string): Date {
  const normalised = raw.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6',
  )
  const d = new Date(normalised)
  if (isNaN(d.getTime())) {
    throw new Error(`Unable to parse BS battleTime: "${raw}"`)
  }
  return d
}

// ─── Pure parser (exported for tests) ────────────────────────────────────────

export interface ParsedBattlelog {
  records: BattleRecord[]
  skipped: Partial<Record<SkipReason, number>>
}

/**
 * Converts raw battlelog entries into BattleRecords from `playerTag`'s
 * perspective.
 *
 * Team battles emit ONE record per enemy-team member (all with player1 = the
 * requester), so the engine's involves-both-players check works even in 3v3
 * rooms where the duel opponent isn't the first roster entry. Records never
 * mix perspectives: `winnerTag` derives strictly from the requester's own
 * `result` / `rank`. Modes are stored pre-normalized via `normalizeGameMode`
 * (the engine normalizes both sides again — belt and braces).
 */
export function parseBrawlStarsBattlelog(
  entries: unknown[],
  playerTag: string,
): ParsedBattlelog {
  const requester = norm(playerTag)
  const records: BattleRecord[] = []
  const skipped: Partial<Record<SkipReason, number>> = {}
  const skip = (r: SkipReason) => {
    skipped[r] = (skipped[r] ?? 0) + 1
  }

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      skip('unrecognized_structure')
      continue
    }
    const e = entry as BSBattleEntry

    if (!e.battleTime) {
      skip('missing_battle_time')
      continue
    }
    let battleTime: Date
    try {
      battleTime = parseBattleTime(e.battleTime)
    } catch {
      skip('bad_battle_time')
      continue
    }

    const mode = normalizeGameMode(e.event?.mode ?? e.battle?.mode)
    const base = { battleTime, gameId: 'brawl-stars' as const, mode, raw: e }

    const teams = e.battle?.teams
    const players = e.battle?.players

    // ── Team modes (gemGrab, brawlBall, knockout…) ──
    if (Array.isArray(teams)) {
      const myTeamIndex = teams.findIndex(
        (team) => Array.isArray(team) && team.some((m) => m?.tag && norm(m.tag) === requester),
      )
      if (myTeamIndex === -1) {
        skip('requester_not_found')
        continue
      }
      if (teams.length < 2) {
        // Both duel players joined the same side in a friendly room — there is
        // no "versus", so no winner can honestly be determined. The duel page
        // instructs players to join OPPOSITE sides.
        skip('same_team')
        continue
      }

      const result = e.battle?.result
      let emitted = 0
      for (let j = 0; j < teams.length; j++) {
        if (j === myTeamIndex) continue
        for (const member of teams[j] ?? []) {
          if (!member?.tag) continue
          const enemyTag = norm(member.tag)
          records.push({
            ...base,
            player1Tag: requester,
            player2Tag: enemyTag,
            winnerTag: result === 'victory' ? requester : result === 'defeat' ? enemyTag : null,
          })
          emitted += 1
        }
      }
      if (emitted === 0) skip('unrecognized_structure')
      continue
    }

    // ── Showdown modes (flat players list + requester's rank) ──
    if (Array.isArray(players)) {
      const withTags = players.filter((p) => p?.tag)
      if (withTags.length !== 2) {
        skip('multiplayer_showdown')
        continue
      }
      const other = withTags.find((p) => norm(p.tag) !== requester)
      const self = withTags.find((p) => norm(p.tag) === requester)
      if (!other || !self) {
        skip('requester_not_found')
        continue
      }
      const rank = e.battle?.rank
      records.push({
        ...base,
        player1Tag: requester,
        player2Tag: norm(other.tag),
        // Two players: rank 1 won, rank 2 lost — the requester's own rank
        // decides both sides.
        winnerTag: rank === 1 ? requester : rank === 2 ? norm(other.tag) : null,
      })
      continue
    }

    skip('unrecognized_structure')
  }

  return { records, skipped }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the last 25 Brawl Stars battles for `playerTag` and returns them
 * as normalised `BattleRecord` objects. Skipped entries are logged by reason.
 *
 * @param playerTag - Supercell player tag, e.g. `'#ABC123'`
 * @throws {SupercellApiError} if the API call fails
 */
export async function fetchBrawlStarsBattles(playerTag: string): Promise<BattleRecord[]> {
  const encoded = encodePlayerTag(playerTag)
  const raw = await supercellGet('brawl-stars', `/players/${encoded}/battlelog`)

  // The BS battlelog endpoint wraps entries under an `items` key
  const unwrapped: unknown =
    raw !== null &&
    typeof raw === 'object' &&
    'items' in (raw as object) &&
    Array.isArray((raw as Record<string, unknown>)['items'])
      ? (raw as Record<string, unknown>)['items']
      : raw

  if (!Array.isArray(unwrapped)) {
    console.warn({
      msg: 'bs_battlelog_unexpected_shape',
      playerTag,
      type: typeof unwrapped,
    })
    return []
  }

  const { records, skipped } = parseBrawlStarsBattlelog(unwrapped, playerTag)

  console.info({
    msg: 'bs_battles_fetched',
    playerTag,
    total: unwrapped.length,
    parsed: records.length,
    ...(Object.keys(skipped).length > 0 ? { skipped } : {}),
  })

  return records
}
