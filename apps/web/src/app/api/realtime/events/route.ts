/**
 * POST /api/realtime/events
 *
 * Internal endpoint for injecting pre-formed realtime events into the event
 * bus. Called by the verifier service, escrow settlement, and tournament
 * engine when they run as separate processes.
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>` header required.
 * The secret must match the `INTERNAL_API_SECRET` environment variable.
 *
 * Body: a fully-formed `RealtimeEvent` object (JSON).
 *
 * Returns: `{ ok: true }` on success, or an error response.
 */

import { timingSafeEqual } from 'node:crypto'
import { getEventBus } from '@/lib/realtime/event-bus'
import type { RealtimeEvent } from '@/lib/realtime/types'

export const runtime = 'nodejs'

function unauthorised(): Response {
  return Response.json({ error: 'Unauthorised' }, { status: 401 })
}

/** Timing-safe string comparison to prevent secret enumeration via timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 })
}

export async function POST(request: Request): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = process.env['INTERNAL_API_SECRET']
  if (!secret) {
    console.error({ msg: 'realtime_events_no_secret_configured' })
    return unauthorised()
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!safeEqual(token, secret)) {
    return unauthorised()
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let event: unknown
  try {
    event = await request.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (
    typeof event !== 'object' ||
    event === null ||
    !('kind' in event) ||
    typeof (event as Record<string, unknown>)['kind'] !== 'string'
  ) {
    return badRequest('Body must be a valid RealtimeEvent with a `kind` field')
  }

  // ── Publish ─────────────────────────────────────────────────────────────────
  try {
    getEventBus().publish(event as RealtimeEvent)
  } catch (err) {
    console.error({
      msg: 'realtime_events_publish_failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Publish failed' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
