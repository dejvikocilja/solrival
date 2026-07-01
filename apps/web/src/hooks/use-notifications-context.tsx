"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, type Notification } from "@/hooks/useNotifications";

export interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  toasts: Notification[];
  cappedAt50: boolean;
  connected: boolean;
  connectionError: string | null;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Owns the single SSE connection + notification list for the signed-in
 * session. Mount once near the root (inside AuthProvider) so the header bell
 * and the /notifications page read and mutate the same state — otherwise
 * "mark as read" in one place wouldn't reflect in the other, and we'd open a
 * duplicate EventSource per consumer.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const authenticated = status === "authenticated";
  // Only stream once a session is confirmed — the endpoint 401s otherwise,
  // and we don't want a reconnect-loop running for signed-out visitors.
  const playerTag = authenticated ? (user?.username ?? null) : null;
  const value = useNotifications(playerTag, authenticated);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** Reads the shared notification state. Must be used within {@link NotificationsProvider}. */
export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotificationsContext must be used within <NotificationsProvider>");
  return ctx;
}
