/**
 * Clash Royale battle fetcher and winner extractor.
 *
 * Fetches the last 25 battles for a player via the official CR API and maps
 * them to the canonical `BattleRecord` shape used by the verification engine.
 *
 * Winner determination: the team with more crowns wins; equal crowns = draw.
 */

import type { BattleRecord } from './types'
import { supercellGet, encodePlayerTag } from './supercell-client'

// ─── Raw API shapes ───────────────────────────────────────────────────────────
// Typed minimally — we only extract what we need.

interface CRBattleTeamMember {
  tag: string
  crowns?: number
}

interface CRBattleTeam extends Array<CRBattleTeamMember> {}

interface CRBattleEntry {
  battleTime: string            // e.g. "20240101T120000.000Z"
  type?: string                 // mode identifier, e.g. "PvP", "casual1v1"
  team?: CRBattleTeam           // requesting player's team
  opponent?: CRBattleTeam       // opposing team
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses the CR battleTime string (ISO-like, no separators) into a Date.
 * Format: `YYYYMMDDTHHmmss.sssZ`
 */
function parseBattleTime(raw: string): Date {
  // Insert separators to make it a valid ISO-8601 string
  // "20240101T120000.000Z" → "2024-01-01T12:00:00.000Z"
  const normalised = raw.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6',
  )
  const d = new Date(normalised)
  if (isNaN(d.getTime())) {
    throw new Error(`Unable to parse CR battleTime: "${raw}"`)
  }
  return d
}

/**
 * Normalises a CR battle `type` string to a lowercase form used for
 * matching against `DuelVerificationContext.gameMode`.
 *
 * The CR API uses varied strings; this maps the common ones but falls
 * back to a lowercased slug for anything unrecognised.
 */
function normaliseMode(raw: string | undefined): string {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase()
  // Known mappings (add more as needed)
  const MODE_MAP: Record<string, string> = {
    pvp: 'ladder',
    'casual1v1': 'casual',
    'ranked1v1': 'ranked',
    'friendlybattle1v1': 'friendly',
  }
  return MODE_MAP[lower] ?? lower
}

/**
 * Extracts both player tags from a battle, normalising them to include `#`.
 * Returns `null` if the battle data is missing required fields.
 */
function extractTags(
  entry: CRBattleEntry,
): { player1Tag: string; player2Tag: string } | null {
  const teamMember = entry.team?.[0]
  const opponentMember = entry.opponent?.[0]
  if (!teamMember?.tag || !opponentMember?.tag) return null
  const tag1 = teamMember.tag.startsWith('#') ? teamMember.tag : `#${teamMember.tag}`
  const tag2 = opponentMember.tag.startsWith('#') ? opponentMember.tag : `#${opponentMember.tag}`
  return { player1Tag: tag1, player2Tag: tag2 }
}

/**
 * Determines the winner tag from crown counts.
 * `player1Tag` is the requesting player's tag.
 * Returns `null` for a draw.
 */
function determineWinner(
  entry: CRBattleEntry,
  player1Tag: string,
  player2Tag: string,
): string | null {
  const p1Crowns = entry.team?.[0]?.crowns ?? 0
  const p2Crowns = entry.opponent?.[0]?.crowns ?? 0
  if (p1Crowns > p2Crowns) return player1Tag
  if (p2Crowns > p1Crowns) return player2Tag
  return null // draw
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the last 25 Clash Royale battles for `playerTag` and returns them
 * as normalised `BattleRecord` objects.
 *
 * Battles that are missing required fields (tags, timestamps) are silently
 * skipped so that one malformed entry cannot block the rest.
 *
 * @param playerTag - Supercell player tag, e.g. `'#ABC123'`
 * @throws {SupercellApiError} if the API call fails
 */
export async function fetchClashRoyaleBattles(playerTag: string): Promise<BattleRecord[]> {
  const encoded = encodePlayerTag(playerTag)
  const raw = await supercellGet('clash-royale', `/players/${encoded}/battlelog`)

  if (!Array.isArray(raw)) {
    console.warn({
      msg: 'cr_battlelog_unexpected_shape',
      playerTag,
      type: typeof raw,
    })
    return []
  }

  const results: BattleRecord[] = []

  for (const entry of raw as unknown[]) {
    // Narrow to object
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as CRBattleEntry

    if (!e.battleTime) continue

    let battleTime: Date
    try {
      battleTime = parseBattleTime(e.battleTime)
    } catch {
      console.warn({ msg: 'cr_battle_time_parse_failed', raw: e.battleTime })
      continue
    }

    const tags = extractTags(e)
    if (!tags) continue

    const winnerTag = determineWinner(e, tags.player1Tag, tags.player2Tag)

    results.push({
      battleTime,
      gameId: 'clash-royale',
      mode: normaliseMode(e.type),
      player1Tag: tags.player1Tag,
      player2Tag: tags.player2Tag,
      winnerTag,
      raw: e,
    })
  }

  console.info({
    msg: 'cr_battles_fetched',
    playerTag,
    total: (raw as unknown[]).length,
    parsed: results.length,
  })

  return results
}
