"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck, WifiOff } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationsContext } from "@/hooks/use-notifications-context";
import type { Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type FilterValue = "all" | "unread";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;

/** Buckets notifications into Today / Yesterday / Earlier, newest first within each. */
function groupByDay(notifications: Notification[]): Array<{ label: string; items: Notification[] }> {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString();

  const buckets: Record<string, Notification[]> = { Today: [], Yesterday: [], Earlier: [] };

  for (const n of notifications) {
    const day = n.receivedAt.toDateString();
    if (day === today) buckets.Today.push(n);
    else if (day === yesterday) buckets.Yesterday.push(n);
    else buckets.Earlier.push(n);
  }

  return (["Today", "Yesterday", "Earlier"] as const)
    .map((label) => ({ label, items: buckets[label] }))
    .filter((group) => group.items.length > 0);
}

export default function NotificationsPage() {
  const { status } = useAuth();
  const {
    notifications,
    unreadCount,
    markAllRead,
    markRead,
    dismiss,
    cappedAt50,
    connected,
    connectionError,
  } = useNotificationsContext();
  const [filter, setFilter] = React.useState<FilterValue>("all");

  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const groups = groupByDay(visible);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        description="Duel results, verification updates, and payouts, as they happen."
        actions={
          unreadCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" aria-hidden />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {status === "loading" ? (
        <div className="h-48 w-full animate-pulse rounded-xl bg-surface-2" />
      ) : status !== "authenticated" ? (
        <EmptyState
          icon={Bell}
          title="Sign in to see your notifications"
          description="Connect your wallet and sign in (top right) to follow your duels in real time."
          action={
            <Link href="/arena" className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
              Browse open duels
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {!connected && connectionError ? (
            <div className="flex items-center gap-2.5 rounded-md border border-ember/30 bg-ember/10 px-3.5 py-2.5 text-body-sm text-ember">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              {connectionError}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="w-48">
              <Segmented
                aria-label="Filter notifications"
                value={filter}
                onValueChange={(v) => setFilter(v as FilterValue)}
                options={[...FILTER_OPTIONS]}
              />
            </div>
            {unreadCount > 0 ? (
              <span className="shrink-0 text-caption text-faint">
                {unreadCount} unread
              </span>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
              description={
                filter === "unread"
                  ? "New activity will show up here as it happens."
                  : "Accept or create a duel to start seeing live updates on results, verification, and payouts."
              }
              action={
                filter === "all" ? (
                  <Link href="/arena" className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
                    Browse open duels
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <h2 className="px-1 text-overline uppercase text-faint">{group.label}</h2>
                  <div className="space-y-1.5">
                    {group.items.map((n) => (
                      <NotificationRow key={n.id} notification={n} onRead={markRead} onDismiss={dismiss} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {cappedAt50 ? (
            <p className="text-center text-caption text-faint">
              Showing your most recent 50 notifications from this session.
            </p>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
