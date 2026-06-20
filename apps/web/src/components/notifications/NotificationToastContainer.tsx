'use client'

/**
 * NotificationToastContainer
 *
 * Fixed bottom-right container that stacks up to 3 toast notifications.
 * Oldest toast sits at the bottom; newest enters from below.
 */

import { NotificationToast } from './NotificationToast'
import type { Notification } from '@/hooks/useNotifications'

interface NotificationToastContainerProps {
  toasts: Notification[]
  onClose: (id: string) => void
}

export function NotificationToastContainer({
  toasts,
  onClose,
}: NotificationToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <NotificationToast
          key={toast.id}
          notification={toast}
          onClose={onClose}
        />
      ))}
    </div>
  )
}
