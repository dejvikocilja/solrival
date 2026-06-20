/**
 * Brawl Stars battle fetcher and winner extractor.
 *
 * Fetches the last 25 battles for a player via the official BS API and maps
 * them to the canonical `BattleRecord` shape used by the verification engine.
 *
 * Winner determination uses the `battle.result` field (`"victory"` / `"defeat"` /
 * `"draw"`), relative to the requesting player's perspective.
 */

import type { BattleRecord } from './types'
import { supercellGet, encodePlayerTag } from './supercell-client'

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface BSBrawler {
  tag: string
  name?: string
}

interface BSTeamMember {
  tag: string
  brawler?: BSBrawler
}

interface BSBattleEntry {
  battleTime: string                       // ISO-8601, e.g. "20240101T120000.000Z"
  event?: {
    id?: number
    mode?: string                          // e.g. "knockout", "gemGrab", "brawlBall"
    map?: string
  }
  battle?: {
    mode?: string                          // sometimes differs from event.mode
    type?: string
    result?: 'victory' | 'defeat' | 'draw'
    teams?: BSTeamMember[][]               // array of teams; each team = array of members
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Normalises a BS mode string to lowercase-kebab for consistent matching.
 *
 * Examples: `"gemGrab"` → `"gem-grab"`, `"knockout"` → `"knockout"`
 */
function normaliseMode(raw: string | undefined): string {
  if (!raw) return 'unknown'
  // camelCase → kebab-case
  return raw
    .replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)
    .toLowerCase()
}

/**
 * Finds which teams contain the requesting player's tag.
 *
 * Returns `{ myTeam, enemyTeam }` where `myTeam` is the team that includes
 * `playerTag`. Returns `null` if the player tag is not found in any team.
 */
function findTeams(
  teams: BSTeamMember[][] | undefined,
  playerTag: string,
): { myTeam: BSTeamMember[]; enemyTeam: BSTeamMember[] } | null {
  if (!teams || teams.length < 2) return null

  // Normalise for comparison
  const norm = (t: string) => t.toUpperCase().replace(/^#?/, '#')
  const normPlayer = norm(playerTag)

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i]
    if (!team) continue
    const inTeam = team.some((m) => norm(m.tag) === normPlayer)
    if (inTeam) {
      // Find the first team that is NOT this team (supports 2-team battles)
      const enemy = teams.find((_, j) => j !== i)
      if (!enemy) return null
      return { myTeam: team, enemyTeam: enemy }
    }
  }
  return null
}

/**
 * Extracts the two opposing player tags from a battle.
 * For 1v1 modes this is unambiguous. For team modes we take the first member
 * of each team.
 *
 * Returns `null` if the structure is too unusual to parse.
 */
function extractTags(
  entry: BSBattleEntry,
  requestingTag: string,
): { player1Tag: string; player2Tag: string } | null {
  const found = findTeams(entry.battle?.teams, requestingTag)
  if (!found) return null

  const p1Raw = found.myTeam[0]?.tag
  const p2Raw = found.enemyTeam[0]?.tag
  if (!p1Raw || !p2Raw) return null

  const norm = (t: string) => t.toUpperCase().replace(/^#?/, '#')
  return { player1Tag: norm(p1Raw), player2Tag: norm(p2Raw) }
}

/**
 * Determines the winner tag from `battle.result` (requestor's perspective).
 * Returns `null` for draws or when the result is unavailable.
 */
function determineWinner(
  result: string | undefined,
  player1Tag: string,
  player2Tag: string,
): string | null {
  if (result === 'victory') return player1Tag
  if (result === 'defeat') return player2Tag
  return null // draw or unknown
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the last 25 Brawl Stars battles for `playerTag` and returns them
 * as normalised `BattleRecord` objects.
 *
 * Battles missing required fields are silently skipped.
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

  const results: BattleRecord[] = []

  for (const entry of unwrapped as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as BSBattleEntry

    if (!e.battleTime) continue

    let battleTime: Date
    try {
      battleTime = parseBattleTime(e.battleTime)
    } catch {
      console.warn({ msg: 'bs_battle_time_parse_failed', raw: e.battleTime })
      continue
    }

    const rawMode = e.event?.mode ?? e.battle?.mode
    const tags = extractTags(e, playerTag)
    if (!tags) continue

    const winnerTag = determineWinner(e.battle?.result, tags.player1Tag, tags.player2Tag)

    results.push({
      battleTime,
      gameId: 'brawl-stars',
      mode: normaliseMode(rawMode),
      player1Tag: tags.player1Tag,
      player2Tag: tags.player2Tag,
      winnerTag,
      raw: e,
    })
  }

  console.info({
    msg: 'bs_battles_fetched',
    playerTag,
    total: (unwrapped as unknown[]).length,
    parsed: results.length,
  })

  return results
}
