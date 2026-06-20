/**
 * Generic Supercell API HTTP client.
 *
 * Handles:
 *  - Bearer-token auth from environment variables
 *  - Player-tag URL encoding (`#` → `%23`)
 *  - Exponential-backoff retries on 429 / 5xx (max 3 attempts)
 *  - Respect for the `Retry-After` header on 429 responses
 *  - Typed `SupercellApiError` with retryability flag
 */

import type { GameId } from './types'

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URLS: Record<GameId, string> = {
  'clash-royale':
    process.env['CLASH_ROYALE_API_BASE_URL'] ?? 'https://api.clashroyale.com/v1',
  'brawl-stars':
    process.env['BRAWL_STARS_API_BASE_URL'] ?? 'https://api.brawlstars.com/v1',
}

const API_TOKENS: Record<GameId, string | undefined> = {
  'clash-royale': process.env['CLASH_ROYALE_API_TOKEN'],
  'brawl-stars': process.env['BRAWL_STARS_API_TOKEN'],
}

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown for any non-2xx response from a Supercell API endpoint.
 */
export class SupercellApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly reason: string,
    /** Whether the caller may safely retry the request. */
    public readonly retryable: boolean,
  ) {
    super(`Supercell API error ${statusCode}: ${reason}`)
    this.name = 'SupercellApiError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encodes a Supercell player tag for use in URL path segments.
 * The API requires the `#` prefix to be percent-encoded as `%23`.
 */
export function encodePlayerTag(tag: string): string {
  return encodeURIComponent(tag)
}

/**
 * Returns the number of milliseconds to wait before the next retry.
 *
 * If the response includes a `Retry-After` header (seconds), that value takes
 * precedence. Otherwise falls back to exponential backoff with jitter.
 */
function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader !== null) {
    const parsed = parseFloat(retryAfterHeader)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.ceil(parsed * 1_000)
    }
  }
  // Exponential backoff: 500ms, 1000ms, 2000ms + up to 20% jitter
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt)
  return base + Math.floor(Math.random() * base * 0.2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Makes an authenticated GET request to a Supercell API endpoint.
 *
 * @param gameId  - Which game API to hit (`'clash-royale'` or `'brawl-stars'`)
 * @param path    - URL path relative to the base URL (e.g. `/players/%2312345/battlelog`)
 * @returns       Parsed JSON response body as `unknown`
 *
 * @throws {SupercellApiError} on a non-2xx response after all retries are exhausted
 */
export async function supercellGet(gameId: GameId, path: string): Promise<unknown> {
  const token = API_TOKENS[gameId]
  if (!token) {
    throw new SupercellApiError(
      0,
      `Missing API token for game "${gameId}". Check environment variables.`,
      false,
    )
  }

  const url = `${BASE_URLS[gameId]}${path}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
    } catch (networkErr) {
      // Network-level failure (DNS, TCP reset, etc.) — always retryable
      if (attempt < MAX_RETRIES) {
        const delay = retryDelayMs(attempt, null)
        console.warn({
          msg: 'supercell_network_error_retrying',
          gameId,
          path,
          attempt,
          delayMs: delay,
          error: networkErr instanceof Error ? networkErr.message : String(networkErr),
        })
        await sleep(delay)
        continue
      }
      throw new SupercellApiError(0, `Network error: ${String(networkErr)}`, true)
    }

    if (response.ok) {
      return response.json() as Promise<unknown>
    }

    const retryAfter = response.headers.get('Retry-After')
    const retryable = isRetryableStatus(response.status)

    if (retryable && attempt < MAX_RETRIES) {
      const delay = retryDelayMs(attempt, retryAfter)
      console.warn({
        msg: 'supercell_api_rate_limited_or_server_error_retrying',
        gameId,
        path,
        statusCode: response.status,
        attempt,
        delayMs: delay,
      })
      await sleep(delay)
      continue
    }

    // Read error body best-effort
    let errorBody = ''
    try {
      errorBody = await response.text()
    } catch {
      // ignore
    }

    throw new SupercellApiError(
      response.status,
      errorBody || response.statusText,
      retryable,
    )
  }

  // TypeScript: unreachable, but satisfies exhaustiveness
  throw new SupercellApiError(0, 'Exceeded max retries', true)
}
