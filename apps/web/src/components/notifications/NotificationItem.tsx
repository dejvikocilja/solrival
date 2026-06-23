'use client'

/**
 * NotificationItem
 *
 * A single row inside the notification bell dropdown. Unread items read a touch
 * brighter; clicking marks the item read and follows the action link.
 */

import Link from 'next/link'
import type { Notification } from '@/hooks/useNotifications'
import type { RealtimeEventKind } from '@/lib/realtime/types'

function dotColour(kind: RealtimeEventKind): string {
  if (kind.startsWith('duel.')) return 'bg-rival'
  if (kind.startsWith('verification.')) return 'bg-cr'
  if (kind === 'reward.paid') return 'bg-victory'
  return 'bg-ember'
}

function timeAgo(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1_000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const { id, kind, title, description, actionHref, read, receivedAt } = notification

  const handleClick = () => onRead(id)

  const content = (
    <div
      className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2 ${
        read ? 'bg-transparent' : 'bg-surface-2/50'
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColour(kind)}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium leading-snug ${read ? 'text-muted' : 'text-fg'}`}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint">{description}</p>
      </div>
      <span className="shrink-0 text-xs text-faint">{timeAgo(receivedAt)}</span>
    </div>
  )

  if (actionHref) {
    return (
      <Link href={actionHref} className="block focus-visible:focus-ring" tabIndex={-1}>
        {content}
      </Link>
    )
  }
  return content
}
