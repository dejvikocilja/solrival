'use client'

/**
 * NotificationItem
 *
 * A single row inside the notification bell dropdown. Unread items read a touch
 * brighter; clicking marks the item read and follows the action link.
 */

import Link from 'next/link'
import type { Notification } from '@/hooks/useNotifications'
import { notificationAccent } from '@/lib/notifications/meta'

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

  const inner = (
    <>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notificationAccent(kind).dotClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium leading-snug ${read ? 'text-muted' : 'text-fg'}`}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint">{description}</p>
      </div>
      <span className="shrink-0 text-xs text-faint">{timeAgo(receivedAt)}</span>
    </>
  )

  const rowClass = `flex items-start gap-3 px-4 py-3 transition-colors ${
    read ? 'bg-transparent' : 'bg-surface-2/50'
  }`

  // A single Link is the one interactive element — no nested role="button" (that
  // announces a button inside a link to screen readers). Following the link
  // marks the item read.
  if (actionHref) {
    return (
      <Link
        href={actionHref}
        onClick={() => onRead(id)}
        className={`${rowClass} hover:bg-surface-2 focus-visible:focus-ring`}
      >
        {inner}
      </Link>
    )
  }

  // No destination — render as a plain, non-interactive row.
  return <div className={rowClass}>{inner}</div>
}
