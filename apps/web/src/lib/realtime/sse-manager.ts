/**
 * SSE client manager.
 *
 * Tracks every connected EventSource client, fans out events from the event
 * bus to the correct subset of clients, and sends 25-second heartbeat pings
 * to keep connections alive through proxies and load balancers.
 */

import { getEventBus } from './event-bus'
import type { RealtimeEvent } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSEClient {
  /** Unique ID for this connection. */
  id: string
  /**
   * Authenticated user's database ID (from session claims).
   * Used to filter targeted events to the correct recipient.
   */
  userId: string
  controller: ReadableStreamDefaultController
  connectedAt: Date
}

// ─── Manager ──────────────────────────────────────────────────────────────────

class SSEManager {
  private readonly clients = new Map<string, SSEClient>()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private busUnsubscribe: (() => void) | null = null

  constructor() {
    this.startHeartbeat()
    this.subscribeToEventBus()
  }

  // ── Registration ────────────────────────────────────────────────────────────

  addClient(client: SSEClient): void {
    this.clients.set(client.id, client)
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId)
  }

  getClientCount(): number {
    return this.clients.size
  }

  // ── Broadcasting ────────────────────────────────────────────────────────────

  broadcast(event: RealtimeEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`

    for (const [id, client] of this.clients) {
      // Targeted event: only deliver to the client whose userId matches
      if (
        event.targetUserId !== undefined &&
        client.userId !== event.targetUserId
      ) {
        continue
      }

      try {
        client.controller.enqueue(data)
      } catch {
        // Write failed — client has disconnected; auto-remove
        this.clients.delete(id)
      }
    }
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    const ping = 'data: {"kind":"ping"}\n\n'

    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        try {
          client.controller.enqueue(ping)
        } catch {
          this.clients.delete(id)
        }
      }
    }, 25_000)

    // Allow Node to exit even if clients are connected
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref()
    }
  }

  // ── Event bus wiring ─────────────────────────────────────────────────────────

  private subscribeToEventBus(): void {
    this.busUnsubscribe = getEventBus().subscribeAll((event) => {
      this.broadcast(event)
    })
  }

  /** Tear-down — only needed in tests or hot-reload scenarios. */
  destroy(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.busUnsubscribe !== null) {
      this.busUnsubscribe()
      this.busUnsubscribe = null
    }
    this.clients.clear()
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

// M-008: use globalThis so the singleton persists across Next.js hot-module
// reloads in development. Without this, each module re-evaluation creates a
// new SSEManager (and a new orphaned heartbeat interval) while the old one
// is silently leaked.
const GLOBAL_KEY = '__solrival_sse_manager__' as const

declare global {
  // eslint-disable-next-line no-var
  var __solrival_sse_manager__: SSEManager | undefined
}

export function getSseManager(): SSEManager {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new SSEManager()
  }
  return globalThis[GLOBAL_KEY]!
}

// Hot-reload cleanup in dev: tear down the old manager before the module is
// replaced so its heartbeat interval doesn't leak into the next evaluation.
if (process.env.NODE_ENV !== 'production' && typeof module !== 'undefined') {
  // @ts-expect-error — module.hot is a webpack/Next.js HMR API
  module.hot?.dispose(() => {
    globalThis[GLOBAL_KEY]?.destroy()
    globalThis[GLOBAL_KEY] = undefined
  })
}

export type { SSEManager }
