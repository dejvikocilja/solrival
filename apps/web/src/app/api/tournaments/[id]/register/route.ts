import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { rateLimit } from "@/server/guards/rate-limit";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { registerForTournament } from "@/server/services/tournament/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  friendLink: z.string().trim().url().max(500).optional(),
});

/** POST /api/tournaments/:id/register — locks the entry fee and joins the bracket. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await params;
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid tournament id", 400);

    const rl = await rateLimit({ key: `tourn_register:${user.id}`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) return fail("RATE_LIMITED", "Too many attempts — try again shortly", 429);

    const { friendLink } = bodySchema.parse(await req.json().catch(() => ({})));
    const player = await registerForTournament(user, id, friendLink);
    return ok({ playerId: player.id, status: player.status }, { status: 201 });
  });
}
