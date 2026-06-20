/**
 * GET /api/realtime/stream
 *
 * Server-Sent Events endpoint. Requires a valid session cookie — returns 401
 * for unauthenticated callers. Each authenticated client only receives events
 * targeted at their userId (plus all-broadcast events with no targetUserId).
 */

import { cookies } from 'next/headers'
import { verifySession } from '@/server/auth/jwt'
import { SESSION_COOKIE } from '@/server/auth/config'
import { getSseManager, type SSEClient } from '@/lib/realtime/sse-manager'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  // ── Authentication ───────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const claims = token ? await verifySession(token) : null

  if (!claims?.sub) {
    return new Response('Unauthorized', { status: 401 })
  }

  const clientId = crypto.randomUUID()
  // Use the verified user ID from session — never a client-supplied param.
  const userId = claims.sub

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = {
        id: clientId,
        userId,
        controller,
        connectedAt: new Date(),
      }

      getSseManager().addClient(client)

      // Send an immediate connection-confirmed comment so the browser
      // EventSource knows the connection is live.
      try {
        controller.enqueue(': connected\n\n')
      } catch {
        // Already closed — safe to ignore
      }
    },

    cancel() {
      getSseManager().removeClient(clientId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
