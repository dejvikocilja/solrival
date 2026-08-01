import { type NextRequest } from "next/server";
import { sweepDetectedDeposits } from "@/server/services/deposit/service";
import { isAuthorizedCron } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One RPC round-trip per pending deposit; the default 10s serverless budget
// would truncate a backlog mid-sweep.
export const maxDuration = 60;

/**
 * /api/internal/deposits/sweep — credits deposits stuck in DETECTED.
 *
 * A deposit is recorded the moment its signature is known, before the transfer
 * is finalized. Normally the browser polls until it credits; this sweep is the
 * guarantee that it credits anyway when the browser doesn't — closed tab, dead
 * websocket, locked wallet, rate-limited RPC. Without it a user's SOL can sit
 * in the treasury uncredited, which is the worst failure this platform has.
 *
 * GET is what platform schedulers call; POST is kept for manual invocation.
 *
 * Shares VERIFY_CRON_SECRET: like the verification sweep, this endpoint moves
 * money, so it is isolated from the benign expiry cron.
 */
async function runSweep(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.VERIFY_CRON_SECRET ?? process.env.EXPIRE_CRON_SECRET;
    if (!isAuthorizedCron(req, secret)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    return ok(await sweepDetectedDeposits());
  });
}

export const GET = runSweep;
export const POST = runSweep;
