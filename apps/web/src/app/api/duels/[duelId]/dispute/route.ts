import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { findDuelById, DuelNotFoundError } from "@/server/services/duel/repo";
import { raiseDispute } from "@/server/services/dispute/service";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";

const raiseDisputeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Please describe the problem in at least 10 characters")
    .max(500, "Keep the description under 500 characters"),
});

/**
 * POST /api/duels/:duelId/dispute — a participant reports a problem with a duel.
 *
 * Live/verifying duels freeze (status → DISPUTED, funds stay locked) until an
 * admin resolves it as a win or a refund. Settled duels can be contested for a
 * window after settlement (DISPUTE_WINDOW_HOURS, default 48h): the result
 * stands but withdrawals for both players pause while the review is open, and
 * the admin may uphold, overturn, or void it. One dispute per duel.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { duelId } = await params;
    const { reason } = raiseDisputeSchema.parse(await req.json());

    const duel = await findDuelById(duelId);
    if (!duel) throw new DuelNotFoundError();

    await raiseDispute(user, duel, reason);
    return ok({ disputed: true });
  });
}
