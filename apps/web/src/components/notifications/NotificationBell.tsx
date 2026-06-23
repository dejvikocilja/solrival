'use client'

/**
 * NotificationBell
 *
 * Header bell button with an unread-count badge. Clicking toggles the
 * notification dropdown; clicking outside or pressing Escape closes it.
 */

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { NotificationItem } from './NotificationItem'
import type { Notification } from '@/hooks/useNotifications'

interface NotificationBellProps {
  notifications: Notification[]
  unreadCount: number
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:focus-ring"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rival px-1 text-[10px] font-semibold leading-none text-rival-fg tabular"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card-hover animate-fade-up"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs text-muted transition-colors hover:text-fg focus-visible:focus-ring rounded"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-faint">
                You&apos;re all caught up.
              </p>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={onMarkRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
