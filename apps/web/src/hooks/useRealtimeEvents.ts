'use client'

/**
 * useRealtimeEvents
 *
 * Opens an EventSource connection to `/api/realtime/stream`, parses incoming
 * events, applies an optional kind filter, and calls `onEvent` for each match.
 *
 * Reconnects automatically on error using exponential backoff (1s → 2s → 4s →
 * … → 30s cap). Ping events are silently dropped and reset the backoff counter.
 *
 * Clean-up is handled automatically on unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RealtimeEvent, RealtimeEventKind } from '@/lib/realtime/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 30_000

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseRealtimeEventsOptions {
  playerTag: string | null
  onEvent?: (event: RealtimeEvent) => void
  filter?: RealtimeEventKind[]
  /**
   * Set to `false` to skip connecting entirely (e.g. signed-out visitors —
   * the endpoint requires a session and would otherwise 401 and burn through
   * the reconnect backoff forever). Defaults to `true`.
   */
  enabled?: boolean
}

export interface UseRealtimeEventsResult {
  connected: boolean
  lastEvent: RealtimeEvent | null
  error: string | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeEvents({
  playerTag,
  onEvent,
  filter,
  enabled = true,
}: UseRealtimeEventsOptions): UseRealtimeEventsResult {
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Stable refs so the effect closure always calls the latest callbacks
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const filterRef = useRef(filter)
  filterRef.current = filter

  const playerTagRef = useRef(playerTag)
  playerTagRef.current = playerTag

  const backoffRef = useRef(BACKOFF_INITIAL_MS)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const tag = playerTagRef.current
    const url = tag
      ? `/api/realtime/stream?playerTag=${encodeURIComponent(tag)}`
      : '/api/realtime/stream'

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      setError(null)
      backoffRef.current = BACKOFF_INITIAL_MS
    }

    es.onmessage = (evt: MessageEvent<string>) => {
      if (!mountedRef.current) return

      let parsed: unknown
      try {
        parsed = JSON.parse(evt.data)
      } catch {
        return
      }

      // Drop pings
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>)['kind'] === 'ping'
      ) {
        backoffRef.current = BACKOFF_INITIAL_MS
        return
      }

      const event = parsed as RealtimeEvent

      // Apply optional filter
      if (filterRef.current && !filterRef.current.includes(event.kind)) {
        return
      }

      setLastEvent(event)
      onEventRef.current?.(event)
    }

    es.onerror = () => {
      if (!mountedRef.current) return
      setConnected(false)
      es.close()

      const delay = backoffRef.current
      backoffRef.current = Math.min(delay * 2, BACKOFF_MAX_MS)
      setError(`Connection lost — reconnecting in ${Math.round(delay / 1000)}s`)

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }
  }, []) // no deps — uses refs for everything mutable

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      return
    }

    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false

      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }

      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [connect, enabled])

  return { connected, lastEvent, error }
}
