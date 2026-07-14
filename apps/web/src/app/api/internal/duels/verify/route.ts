import { type NextRequest } from "next/server";
import { runVerificationSweep } from "@/server/services/duel/verification-sweep";
import { isAuthorizedCron } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sweep makes one outbound Supercell call per live duel; the default 10s
// serverless budget would truncate a busy tick mid-settlement.
export const maxDuration = 60;

/**
 * /api/internal/duels/verify — verification sweep.
 *
 * Runs one verification attempt per in-flight duel: settles winners, refunds
 * unverifiable duels past their window, and escalates timeouts to review.
 *
 * GET is what platform schedulers (e.g. Vercel Cron) call; POST is kept for
 * manual invocation and external keepers. Both take the same path.
 *
 * Its own secret: this sweep MOVES MONEY (credits settle between users), so it
 * is isolated from the benign expiry cron. Falls back to EXPIRE_CRON_SECRET so
 * existing deployments keep working — set VERIFY_CRON_SECRET to complete the
 * isolation, then rotate.
 */
async function runSweep(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.VERIFY_CRON_SECRET ?? process.env.EXPIRE_CRON_SECRET;
    if (!isAuthorizedCron(req, secret)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    return ok(await runVerificationSweep());
  });
}

export const GET = runSweep;
export const POST = runSweep;
