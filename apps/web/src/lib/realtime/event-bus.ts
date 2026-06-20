/**
 * In-process typed event bus.
 *
 * Built on Node.js EventEmitter. Each domain action publishes here; the SSE
 * manager subscribes via the wildcard `'*'` channel to fan-out to clients.
 *
 * Swap the singleton for a Redis pub/sub adapter later without touching
 * callers — only `getEventBus()` needs to change.
 */

import { EventEmitter } from 'events'
import type { RealtimeEvent, RealtimeEventKind, EventMap } from './types'

// ─── Bus class ────────────────────────────────────────────────────────────────

class EventBus {
  private readonly emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    // M-009: set to 0 (unlimited) — we manage listener lifetime carefully via
    // the unsubscribe functions returned by subscribe/subscribeAll, so the
    // static ceiling of 100 would cause spurious warnings under load.
    this.emitter.setMaxListeners(0)
  }

  /**
   * Subscribe to a specific event kind.
   *
   * @returns An unsubscribe function — call it on cleanup.
   */
  subscribe<K extends RealtimeEventKind>(
    kind: K,
    handler: (event: EventMap[K]) => void,
  ): () => void {
    this.emitter.on(kind, handler)
    return () => this.emitter.off(kind, handler)
  }

  /**
   * Subscribe to ALL events via the wildcard channel.
   * Used by the SSE manager to broadcast every event to connected clients.
   *
   * @returns An unsubscribe function.
   */
  subscribeAll(handler: (event: RealtimeEvent) => void): () => void {
    this.emitter.on('*', handler)
    return () => this.emitter.off('*', handler)
  }

  /**
   * Publish an event. Emits on the specific kind channel AND the `'*'` wildcard.
   */
  publish(event: RealtimeEvent): void {
    this.emitter.emit(event.kind, event)
    this.emitter.emit('*', event)
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

// M-009: store the singleton on globalThis so the same EventBus instance is
// reused across Next.js hot-module reloads in development. Without this, each
// reload creates a new EventBus while the old one's subscriptions are orphaned,
// causing the SSEManager (which subscribed to the old bus) to stop receiving
// events after the first hot reload.
const GLOBAL_KEY = '__solrival_event_bus__' as const

declare global {
  // eslint-disable-next-line no-var
  var __solrival_event_bus__: EventBus | undefined
}

export function getEventBus(): EventBus {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new EventBus()
  }
  return globalThis[GLOBAL_KEY]!
}

export type { EventBus }
