/**
 * Player-profile lookups against the official Supercell APIs — used when a
 * user links a game account, to prove the tag exists and to capture the
 * arena stats (name, trophies, level). Runs through the same proxied
 * client as battle verification, so it works wherever the verifier works.
 */

import { supercellGet, SupercellApiError, encodePlayerTag } from './supercell-client'
import type { GameId } from './types'

export interface PlayerProfile {
  /** Canonical tag as the API reports it (uppercase, leading '#'). */
  tag: string
  name: string
  trophies: number | null
  /** Experience level (Clash Royale) or null where the game has none. */
  level: number | null
}

/**
 * Fetches a player's public profile. Returns null when the tag doesn't exist
 * (404) — the caller turns that into a friendly "player not found" error.
 * Other API failures (bad token, rate limit exhaustion, 5xx) throw
 * SupercellApiError and should surface as a retryable server error.
 */
export async function fetchPlayerProfile(gameId: GameId, playerTag: string): Promise<PlayerProfile | null> {
  try {
    const raw = (await supercellGet(gameId, `/players/${encodePlayerTag(playerTag)}`)) as {
      tag?: string
      name?: string
      trophies?: number
      expLevel?: number
    }
    if (!raw || typeof raw.tag !== 'string' || typeof raw.name !== 'string') return null
    return {
      tag: raw.tag,
      name: raw.name,
      trophies: typeof raw.trophies === 'number' ? raw.trophies : null,
      level: typeof raw.expLevel === 'number' ? raw.expLevel : null,
    }
  } catch (err) {
    if (err instanceof SupercellApiError && err.statusCode === 404) return null
    throw err
  }
}
