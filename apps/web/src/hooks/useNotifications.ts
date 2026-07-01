'use client'

/**
 * useNotifications
 *
 * Wraps `useRealtimeEvents` and converts each incoming event into a
 * human-readable `Notification`. Manages a capped list (max 50), unread count,
 * and a toast queue (newest 3 unread).
 *
 * Toasts auto-dismiss after 5 seconds.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeEvents } from './useRealtimeEvents'
import type { RealtimeEvent, RealtimeEventKind } from '@/lib/realtime/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  kind: RealtimeEventKind
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  read: boolean
  receivedAt: Date
}

// ─── Notification factory ─────────────────────────────────────────────────────

function toNotification(
  event: RealtimeEvent,
  playerTag: string | null,
): Notification | null {
  const base = {
    id: event.id,
    kind: event.kind,
    read: false,
    receivedAt: new Date(event.occurredAt),
  }

  switch (event.kind) {
    case 'duel.accepted':
      return {
        ...base,
        title: 'Duel Accepted',
        description: `Your duel against ${event.challengerTag} is now active. Good luck!`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'duel.expired':
      return {
        ...base,
        title: 'Duel Expired',
        description: `Duel #${event.duelId.slice(0, 8)} expired. ${event.refundedSol} SOL has been refunded.`,
        actionLabel: 'Create new duel',
        actionHref: '/duels/create',
      }

    case 'verification.started':
      return {
        ...base,
        title: 'Verification Started',
        description: `We're checking the battle log for your duel against ${
          playerTag === event.player1Tag ? event.player2Tag : event.player1Tag
        }.`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'verification.completed': {
      const isWinner = playerTag !== null && event.winnerTag === playerTag

      if (event.status === 'verified' && isWinner) {
        return {
          ...base,
          title: 'You Won! 🏆',
          description: `Victory confirmed — your reward is on its way.`,
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      if (event.status === 'verified' && !isWinner) {
        return {
          ...base,
          title: 'Match Verified',
          description: `${event.winnerTag ?? 'Opponent'} won the duel. Better luck next time!`,
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      if (event.status === 'disputed') {
        return {
          ...base,
          title: 'Duel Disputed',
          description: 'Automatic verification could not confirm a result. Our team will review this duel.',
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      // timeout
      return {
        ...base,
        title: 'Duel Timed Out',
        description: 'No matching battle was found within the verification window. The duel has been voided.',
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }
    }

    case 'reward.paid':
      return {
        ...base,
        title: 'Reward Received',
        description: `+${event.amountSol} SOL added to your wallet (${event.feeSol} SOL platform fee deducted).`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'tournament.started':
      return {
        ...base,
        title: 'Tournament Started',
        description: `${event.name} has begun with ${event.playerCount} players. Check the bracket!`,
        actionLabel: 'View bracket',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.match_ready':
      return {
        ...base,
        title: 'Your Match Is Ready',
        description: `Round ${event.roundNumber}: ${event.player1Tag} vs ${event.player2Tag}. Time to play!`,
        actionLabel: 'View match',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.match_completed':
      return {
        ...base,
        title: 'Match Completed',
        description: `Round ${event.roundNumber} result: ${event.winnerTag} advances to the next round.`,
        actionLabel: 'View bracket',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.completed': {
      const isChampion = playerTag !== null && event.winnerTag === playerTag
      return {
        ...base,
        title: isChampion ? '🏆 Tournament Champion!' : 'Tournament Complete',
        description: isChampion
          ? `You won ${event.name} and ${event.prizePoolSol} SOL!`
          : `${event.name} has ended. ${event.winnerTag} takes the trophy and ${event.prizePoolSol} SOL.`,
        actionLabel: 'View results',
        actionHref: `/tournaments/${event.tournamentId}`,
      }
    }

    default:
      return null
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 50
const MAX_TOASTS = 3
const TOAST_DISMISS_MS = 5_000

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

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      const notification = toNotification(event, playerTag)
      if (!notification) return

      setNotifications((prev) => {
        const next = [notification, ...prev].slice(0, MAX_NOTIFICATIONS)
        return next
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
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setToastIds((prev) => prev.filter((t) => t !== id))
    const timer = dismissTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      dismissTimers.current.delete(id)
    }
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
