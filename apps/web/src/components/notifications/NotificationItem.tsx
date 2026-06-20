'use client'

/**
 * NotificationItem
 *
 * A single row inside the notification bell dropdown.
 * Unread items use a slightly brighter background.
 * Clicking marks the item read and navigates to the action href.
 */

import Link from 'next/link'
import type { Notification } from '@/hooks/useNotifications'
import type { RealtimeEventKind } from '@/lib/realtime/types'

// ─── Colour dot ───────────────────────────────────────────────────────────────

function dotColour(kind: RealtimeEventKind): string {
  if (kind.startsWith('duel.')) return 'bg-violet-500'
  if (kind.startsWith('verification.')) return 'bg-blue-500'
  if (kind === 'reward.paid') return 'bg-emerald-500'
  return 'bg-amber-500'
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1_000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const { id, kind, title, description, actionHref, read, receivedAt } = notification

  const handleClick = () => onRead(id)

  const content = (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer
        ${read ? 'bg-zinc-900 hover:bg-zinc-800/60' : 'bg-zinc-800 hover:bg-zinc-700/60'}
      `}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
    >
      {/* Colour dot */}
      <span
        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dotColour(kind)}`}
        aria-hidden
      />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium leading-snug truncate ${
            read ? 'text-zinc-300' : 'text-zinc-100'
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 truncate">{description}</p>
      </div>

      {/* Time */}
      <span className="flex-shrink-0 text-xs text-zinc-600">{timeAgo(receivedAt)}</span>
    </div>
  )

  if (actionHref) {
    return (
      <Link href={actionHref} className="block" tabIndex={-1}>
        {content}
      </Link>
    )
  }

  return content
}
