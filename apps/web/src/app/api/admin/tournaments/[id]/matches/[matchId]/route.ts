import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { reportMatch } from "@/server/services/tournament/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  winnerId: z.string().uuid(), // TournamentPlayer.id of the winner
});

/**
 * POST /api/admin/tournaments/:id/matches/:matchId — record a match result.
 * Advances the winner through the bracket and, when the final is decided,
 * completes the tournament and pays out prizes on the credits ledger.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const { id, matchId } = await params;
    if (!isValidUuid(id) || !isValidUuid(matchId)) {
      return fail("BAD_ID", "Invalid id", 400);
    }
    const { winnerId } = bodySchema.parse(await req.json());
    const match = await reportMatch(id, matchId, winnerId);
    return ok({ data: { id: match.id, status: match.status, winnerId: match.winnerId } });
  });
}
