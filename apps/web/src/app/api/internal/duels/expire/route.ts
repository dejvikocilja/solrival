import { type NextRequest } from "next/server";
import { expireDuels } from "@/server/services/duel/service";
import { isAuthorizedCron } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/internal/duels/expire — expires unaccepted duels past their window and
 * returns the creator's stake.
 *
 * GET is what platform schedulers call; POST is kept for manual invocation and
 * external keepers. Protected by a shared secret (constant-time), not user auth.
 */
async function runExpiry(req: NextRequest) {
  return handle(async () => {
    if (!isAuthorizedCron(req, process.env.EXPIRE_CRON_SECRET)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    return ok(await expireDuels());
  });
}

export const GET = runExpiry;
export const POST = runExpiry;
