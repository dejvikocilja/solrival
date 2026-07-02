import { type NextRequest } from "next/server";
import { runVerificationSweep } from "@/server/services/duel/verification-sweep";
import { isAuthorizedInternal } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/duels/verify — verification sweep.
 * Invoked by a scheduler/keeper on the static-egress host (Supercell tokens are
 * IP-whitelisted). Runs one verification attempt per live duel and settles
 * winners / disputes timeouts. Protected by a shared secret (constant-time),
 * not user auth.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Own secret: the verification sweep triggers settlements (credits move
    // between users), so it warrants isolation from the benign expiry cron.
    // Falls back to EXPIRE_CRON_SECRET so existing deployments keep working —
    // set VERIFY_CRON_SECRET to complete the isolation, then rotate.
    const secret = process.env.VERIFY_CRON_SECRET ?? process.env.EXPIRE_CRON_SECRET;
    if (!isAuthorizedInternal(req, secret)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    const result = await runVerificationSweep();
    return ok(result);
  });
}
