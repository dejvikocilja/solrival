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
 * POST /api/duels/:duelId/dispute — a participant reports a problem with a live
 * or verifying duel. Freezes settlement (status → DISPUTED) until an admin
 * resolves it as a win or a refund. One dispute per duel.
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
