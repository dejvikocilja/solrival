import { type NextRequest } from "next/server";
import { processApprovedWithdrawals } from "@/server/services/withdrawal/service";
import { isAuthorizedCron } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each payout is an on-chain transfer awaiting confirmation; a batch needs room.
export const maxDuration = 60;

/**
 * /api/internal/withdrawals/process — treasury payout worker.
 *
 * Sends SOL for every APPROVED withdrawal and settles the balance locks. This
 * is the only context that touches TREASURY_SECRET_KEY.
 *
 * GET is what platform schedulers call; POST is kept for manual invocation and
 * external keepers.
 *
 * Protected by its OWN secret (WITHDRAWAL_CRON_SECRET), distinct from the
 * benign duel crons — a leak of the expiry token must never be able to trigger
 * payouts. Constant-time comparison, never user auth.
 */
async function runPayouts(req: NextRequest) {
  return handle(async () => {
    if (!isAuthorizedCron(req, process.env.WITHDRAWAL_CRON_SECRET)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    const results = await processApprovedWithdrawals();
    return ok({ processed: results.length, results });
  });
}

export const GET = runPayouts;
export const POST = runPayouts;
