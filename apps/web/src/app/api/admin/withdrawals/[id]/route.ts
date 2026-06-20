import { type NextRequest } from "next/server";
import { reviewWithdrawalSchema } from "@solrival/shared";
import { prisma } from "@solrival/db";
import { requireAdmin } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { reviewWithdrawal, toWithdrawalView } from "@/server/services/withdrawal/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/withdrawals/:id — full detail for one request. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid withdrawal id", 400);

    const w = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: {
        user: { select: { username: true, walletAddress: true, wins: true, losses: true } },
        reviewedByAdmin: { select: { username: true } },
      },
    });
    if (!w) return fail("NOT_FOUND", "Withdrawal not found", 404);
    return ok({
      data: {
        ...toWithdrawalView(w),
        user: w.user,
        reviewedBy: w.reviewedByAdmin?.username ?? null,
      },
    });
  });
}

/**
 * POST /api/admin/withdrawals/:id — approve or reject a held withdrawal.
 * Approve queues it for treasury payout; reject reverts the locked funds.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { id } = await params;
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid withdrawal id", 400);

    const { decision, notes } = reviewWithdrawalSchema.parse(await req.json());
    const updated = await reviewWithdrawal(admin, id, decision, notes);
    return ok({ data: toWithdrawalView(updated) });
  });
}
