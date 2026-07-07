import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok } from "@/server/http/respond";
import {
  listNotifications,
  markNotificationsRead,
} from "@/server/services/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/notifications — the caller's persisted notifications, newest first (max 50). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({ notifications: await listNotifications(user.id) });
  });
}

// Bounded id list — the client never holds more than 50, so 100 is generous.
const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
});

/**
 * PATCH /api/notifications — mark notifications read.
 * Body `{ ids: [...] }` marks specific ones; `{}` (or empty body) marks all.
 */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    // An empty body means "mark everything read" — don't 400 on it.
    const body: unknown = await req.json().catch(() => ({}));
    const input = markReadSchema.parse(body);
    const updated = await markNotificationsRead(user.id, input.ids);
    return ok({ updated });
  });
}
