import { type NextRequest } from "next/server";
import { createDuelSchema, listDuelsQuerySchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { rateLimit } from "@/server/guards/rate-limit";
import { createCreditDuel } from "@/server/services/duel/credit-duel";
import { getArena } from "@/server/services/duel/arena";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    // H-009: 5 duel creations per user per minute — prevents Supercell API exhaustion.
    const rl = await rateLimit({ key: `create_duel:${user.id}`, limit: 5, windowMs: 60_000 });
    if (!rl.ok) return fail("RATE_LIMITED", "Too many duels created — try again in a minute", 429);

    const input = createDuelSchema.parse(await req.json());
    // Credits model: the stake is locked from the creator's GGDUEL balance and
    // the duel opens immediately — no wallet signature required.
    const result = await createCreditDuel(user, input);
    return ok(result, { status: 201 });
  });
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = listDuelsQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok(await getArena(q));
  });
}
