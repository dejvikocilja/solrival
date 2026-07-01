'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import type { Notification } from '@/hooks/useNotifications'
import { notificationAccent } from '@/lib/notifications/meta'
import { cn } from '@/lib/utils'

function formatTimestamp(date: Date): string {
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export interface NotificationRowProps {
  notification: Notification
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}

export function NotificationRow({ notification, onRead, onDismiss }: NotificationRowProps) {
  const { id, kind, title, description, actionLabel, actionHref, read, receivedAt } = notification
  const { icon: Icon, chipClass } = notificationAccent(kind)

  const inner = (
    <>
      <span
        className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', chipClass)}
        aria-hidden
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className={cn('text-body-sm font-medium leading-snug', read ? 'text-muted' : 'text-fg')}>{title}</p>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-caption text-faint">
            {formatTimestamp(receivedAt)}
          </span>
        </div>
        <p className="mt-0.5 text-body-sm text-muted">{description}</p>
        {actionLabel && actionHref ? (
          <span className="mt-1.5 inline-block text-caption font-medium text-rival">{actionLabel} →</span>
        ) : null}
      </div>

      {!read ? <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rival" aria-hidden /> : null}
    </>
  )

  const rowClass = cn(
    'flex items-start gap-3.5 rounded-lg border px-4 py-3.5 transition-colors',
    read ? 'border-border bg-transparent' : 'border-border bg-surface-2/50',
  )

  // The dismiss button is a SIBLING of the Link, never a descendant — nesting a
  // <button> inside an <a> is invalid and mis-announced by screen readers. The
  // wrapper is `relative` and the dismiss floats in the top-right corner with
  // its own padding reserved (pr-11) so text never sits under it.
  return (
    <div className="group relative">
      {actionHref ? (
        <Link
          href={actionHref}
          onClick={() => onRead(id)}
          className={cn(rowClass, 'cursor-pointer pr-11 hover:border-border-strong hover:bg-surface-2 focus-visible:focus-ring')}
        >
          {inner}
        </Link>
      ) : (
        <div className={cn(rowClass, 'pr-11')}>{inner}</div>
      )}

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:focus-ring group-hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
