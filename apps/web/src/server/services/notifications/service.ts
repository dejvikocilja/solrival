/**
 * Notification persistence.
 *
 * Every realtime event that targets a specific user (duel accepted/expired,
 * verification updates, reward paid, dispute raised/resolved) is written here
 * by the event publisher so the header bell and /notifications page survive
 * page refreshes. Broadcast events (no `targetUserId` — e.g. tournament
 * announcements) are deliberately NOT persisted: they'd require a fan-out row
 * per user for content that's visible on the tournament pages anyway.
 *
 * Design notes:
 * - The row id IS the realtime event UUID, so a replayed publish (idempotent
 *   settlement re-runs, dev hot reloads) is a unique-violation no-op, never a
 *   duplicate bell item.
 * - `payload` stores the full RealtimeEvent verbatim. The client re-renders it
 *   through the same `toNotification` factory used for live SSE events, so
 *   notification copy lives in exactly one place.
 * - Persistence is fire-and-forget relative to the SSE publish: a DB hiccup
 *   must never block or fail the domain action that emitted the event. Live
 *   delivery still happens; only refresh-durability degrades (and is logged).
 */

import { prisma, Prisma } from "@solrival/db";
import type { RealtimeEvent } from "@/lib/realtime/types";

// Hard cap per user — the UI shows at most 50; we keep a small buffer beyond
// that, then prune oldest-first on insert so the table can't grow unbounded.
const MAX_PERSISTED_PER_USER = 100;

/** Newest-first page size returned to the client (matches the UI's 50 cap). */
const LIST_LIMIT = 50;

// ─── Persist (called by the event publisher) ─────────────────────────────────

/**
 * Fire-and-forget persistence of a targeted event. Never throws; never blocks
 * the caller. Broadcast events (no targetUserId) return immediately.
 */
export function persistNotification(event: RealtimeEvent): void {
  const userId = event.targetUserId;
  if (!userId) return;

  void (async () => {
    try {
      await prisma.notification.create({
        data: {
          id: event.id,
          userId,
          kind: event.kind,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });

      // Prune overflow beyond the newest MAX_PERSISTED_PER_USER for this user.
      const overflow = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: MAX_PERSISTED_PER_USER,
        select: { id: true },
      });
      if (overflow.length > 0) {
        await prisma.notification.deleteMany({
          where: { id: { in: overflow.map((n) => n.id) } },
        });
      }
    } catch (err) {
      // P2002 = duplicate event id — an idempotent replay, not an error.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return;
      }
      console.error("[notifications] failed to persist event", event.id, err);
    }
  })();
}

// ─── Read APIs (called by /api/notifications routes) ─────────────────────────

export interface StoredNotification {
  /** The original realtime event, replayable through the client renderer. */
  event: RealtimeEvent;
  read: boolean;
}

/** Newest-first notifications for a user, capped at {@link LIST_LIMIT}. */
export async function listNotifications(userId: string): Promise<StoredNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: { payload: true, readAt: true },
  });
  return rows.map((row) => ({
    event: row.payload as unknown as RealtimeEvent,
    read: row.readAt !== null,
  }));
}

/**
 * Marks notifications read. With `ids`, only those rows (scoped to the user);
 * without, everything unread. Returns the number of rows updated.
 */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Deletes a single notification. Scoped to the owner — a valid id belonging to
 * another user is a silent no-op, never an information leak.
 */
export async function dismissNotification(userId: string, id: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { id, userId } });
}
