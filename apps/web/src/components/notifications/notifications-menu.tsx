"use client";

import { useNotificationsContext } from "@/hooks/use-notifications-context";
import { NotificationBell } from "./NotificationBell";
import { NotificationToastContainer } from "./NotificationToastContainer";

/**
 * Live notifications for an authenticated player: the header bell + the
 * transient toast stack, both fed by the shared realtime event stream (see
 * NotificationsProvider). Mount this only when signed in — the SSE endpoint
 * requires a session.
 */
export function NotificationsMenu() {
  const { notifications, unreadCount, markAllRead, markRead, dismiss, toasts } =
    useNotificationsContext();

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
