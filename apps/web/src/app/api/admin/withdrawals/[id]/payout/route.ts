import { type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { processWithdrawal, toWithdrawalView } from "@/server/services/withdrawal/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/withdrawals/:id/payout — admin-triggered treasury payout for a
 * single APPROVED withdrawal. Same effect as the keeper sweep, scoped to one
 * row, behind admin session + same-origin. processWithdrawal is idempotent at
 * the status level (claims APPROVED -> PROCESSING), so a double-click is safe.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    await requireAdmin();
    const { id } = await params;
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid withdrawal id", 400);

    const updated = await processWithdrawal(id);
    return ok({ data: toWithdrawalView(updated) });
  });
}