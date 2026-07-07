'use client'

/**
 * useNotifications
 *
 * Wraps `useRealtimeEvents` and converts each incoming event into a
 * human-readable `Notification` (see `@/lib/notifications/render`). Manages a
 * capped list (max 50), unread count, and a toast queue (newest 3 unread).
 *
 * Persistence: on sign-in the hook hydrates from GET /api/notifications (the
 * server stores every targeted event), then merges live SSE events on top,
 * deduped by event id. Mark-read and dismiss update local state optimistically
 * and persist fire-and-forget — a failed write costs read-state durability,
 * never UI responsiveness. Toasts are only raised for LIVE events; hydrated
 * history never re-toasts on refresh.
 *
 * Toasts auto-dismiss after 5 seconds.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeEvents } from './useRealtimeEvents'
import { toNotification, type Notification } from '@/lib/notifications/render'
import type { RealtimeEvent } from '@/lib/realtime/types'

// Re-export so existing component imports (`from '@/hooks/useNotifications'`)
// keep working after the renderer moved to lib.
export type { Notification }

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 50
const MAX_TOASTS = 3
const TOAST_DISMISS_MS = 5_000

// ─── Persistence helpers (fire-and-forget) ────────────────────────────────────

interface StoredNotification {
  event: RealtimeEvent
  read: boolean
}

function persistRead(ids?: string[]): void {
  void fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(ids ? { ids } : {}),
  }).catch(() => {
    // Offline / transient failure — local state already updated; the worst
    // case is the item shows unread again after the next refresh.
  })
}

function persistDismiss(id: string): void {
  void fetch(`/api/notifications/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  }).catch(() => {
    // Same rationale as persistRead.
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(
  playerTag: string | null,
  enabled: boolean = true,
): {
  notifications: Notification[]
  unreadCount: number
  markAllRead: () => void
  markRead: (id: string) => void
  dismiss: (id: string) => void
  toasts: Notification[]
  cappedAt50: boolean
  connected: boolean
  connectionError: string | null
} {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [toastIds, setToastIds] = useState<string[]>([])
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const hydratedRef = useRef(false)

  const scheduleToastDismiss = useCallback((id: string) => {
    const existing = dismissTimers.current.get(id)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      setToastIds((prev) => prev.filter((t) => t !== id))
      dismissTimers.current.delete(id)
    }, TOAST_DISMISS_MS)

    dismissTimers.current.set(id, timer)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  // ── Hydration: load persisted notifications once per session ────────────────
  useEffect(() => {
    if (!enabled || playerTag === null) {
      // Signed out (or session ended): clear everything and allow a fresh
      // hydration on the next sign-in.
      hydratedRef.current = false
      setNotifications([])
      setToastIds([])
      return
    }
    if (hydratedRef.current) return
    hydratedRef.current = true

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/notifications', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = (await res.json()) as { notifications: StoredNotification[] }
        if (cancelled) return

        setNotifications((prev) => {
          // Live SSE events may have landed before the fetch resolved — they
          // win (they're newest and already toasted). Dedupe by event id.
          const seen = new Set(prev.map((n) => n.id))
          const hydrated = data.notifications
            .map(({ event, read }) => {
              const n = toNotification(event, playerTag)
              return n ? { ...n, read } : null
            })
            .filter((n): n is Notification => n !== null && !seen.has(n.id))

          return [...prev, ...hydrated]
            .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
            .slice(0, MAX_NOTIFICATIONS)
        })
      } catch {
        // Fetch failed — degrade to session-only behavior (live events still
        // arrive over SSE); nothing to surface to the user.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, playerTag])

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      const notification = toNotification(event, playerTag)
      if (!notification) return

      setNotifications((prev) => {
        // Guard against SSE redelivery / hydration overlap
        if (prev.some((n) => n.id === notification.id)) return prev
        return [notification, ...prev].slice(0, MAX_NOTIFICATIONS)
      })

      // Promote to toast queue
      setToastIds((prev) => {
        const next = [notification.id, ...prev].slice(0, MAX_TOASTS)
        return next
      })

      scheduleToastDismiss(notification.id)
    },
    [playerTag, scheduleToastDismiss],
  )

  const { connected, error: connectionError } = useRealtimeEvents({ playerTag, onEvent: handleEvent, enabled })

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
    persistRead([id])
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    persistRead()
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setToastIds((prev) => prev.filter((t) => t !== id))
    const timer = dismissTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      dismissTimers.current.delete(id)
    }
    persistDismiss(id)
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const toasts = toastIds
    .map((id) => notifications.find((n) => n.id === id))
    .filter((n): n is Notification => n !== undefined)

  // L-006: signal when the notification list has hit the 50-item cap so the
  // UI can surface a "oldest notifications dropped" indicator if desired.
  const cappedAt50 = notifications.length >= MAX_NOTIFICATIONS

  return {
    notifications,
    unreadCount,
    markAllRead,
    markRead,
    dismiss,
    toasts,
    cappedAt50,
    connected,
    connectionError,
  }
}
