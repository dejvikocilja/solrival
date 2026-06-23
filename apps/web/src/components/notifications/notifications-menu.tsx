"use client";

import { useNotifications } from "@/hooks/useNotifications";
import { NotificationBell } from "./NotificationBell";
import { NotificationToastContainer } from "./NotificationToastContainer";

/**
 * Live notifications for an authenticated player: the header bell + the
 * transient toast stack, both fed by the realtime event stream. Mount this only
 * when signed in — the SSE endpoint requires a session.
 */
export function NotificationsMenu() {
  const { notifications, unreadCount, markAllRead, markRead, dismiss, toasts } =
    useNotifications(null);

  return (
    <>
      <NotificationBell
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
        onMarkRead={markRead}
      />
      <NotificationToastContainer toasts={toasts} onClose={dismiss} />
    </>
  );
}
