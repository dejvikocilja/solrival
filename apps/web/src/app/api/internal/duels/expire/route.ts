import { type NextRequest } from "next/server";
import { expireDuels } from "@/server/services/duel/service";
import { isAuthorizedInternal } from "@/server/guards/internal-auth";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invoked by a scheduler/keeper. Protected by a shared secret (constant-time), not user auth. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isAuthorizedInternal(req, process.env.EXPIRE_CRON_SECRET)) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }
    const result = await expireDuels();
    return ok(result);
  });
}
