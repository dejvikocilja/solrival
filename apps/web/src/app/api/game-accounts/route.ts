import { type NextRequest } from "next/server";
import { linkGameAccountSchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok } from "@/server/http/respond";
import { linkGameAccount, listGameAccounts } from "@/server/services/game-account/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/game-accounts — the caller's linked game accounts. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({ accounts: await listGameAccounts(user.id) });
  });
}

/**
 * PUT /api/game-accounts — link or update the caller's account for one game.
 * Validates the player tag against the live game API before saving.
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const input = linkGameAccountSchema.parse(await req.json());
    const account = await linkGameAccount(user.id, input);
    return ok({ account });
  });
}
