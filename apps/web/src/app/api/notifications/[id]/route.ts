import { type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { handle, ok, fail } from "@/server/http/respond";
import { dismissNotification } from "@/server/services/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/notifications/:id — dismiss (delete) one of the caller's
 * notifications. Idempotent: dismissing an already-gone id still returns ok,
 * and ids belonging to other users are silent no-ops (no existence oracle).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await params;
    if (!isValidUuid(id)) return fail("VALIDATION_ERROR", "Invalid notification id", 400);
    await dismissNotification(user.id, id);
    return ok({ dismissed: true });
  });
}
