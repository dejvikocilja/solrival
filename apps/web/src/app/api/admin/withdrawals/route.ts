import { type NextRequest } from "next/server";
import { type WithdrawalStatus } from "@solrival/db";
import { WITHDRAWAL_STATUSES } from "@solrival/shared";
import { requireAdmin } from "@/server/auth/session";
import { listWithdrawalQueue } from "@/server/services/withdrawal/service";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/withdrawals — withdrawal queue for the admin dashboard.
 * Defaults to the rows needing action (PENDING_REVIEW). Filter via ?status=.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") ?? "PENDING_REVIEW";
    const status = (WITHDRAWAL_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as WithdrawalStatus)
      : undefined; // "all"
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)));

    return ok(await listWithdrawalQueue({ status, page, limit }));
  });
}
