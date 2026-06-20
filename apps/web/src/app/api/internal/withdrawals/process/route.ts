import { type NextRequest } from "next/server";
import { processApprovedWithdrawals } from "@/server/services/withdrawal/service";
import { isAuthorizedInternal } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/withdrawals/process — treasury payout worker.
 * Invoked by a scheduler/keeper (the only context with TREASURY_SECRET_KEY).
 * Sends SOL for every APPROVED withdrawal and settles the locks.
 *
 * Protected by its OWN secret (WITHDRAWAL_CRON_SECRET), distinct from the benign
 * duel crons — a leak of the expiry cron token can't trigger payouts. Compared
 * in constant time, never user auth.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isAuthorizedInternal(req, process.env.WITHDRAWAL_CRON_SECRET)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    const results = await processApprovedWithdrawals();
    return ok({ processed: results.length, results });
  });
}
