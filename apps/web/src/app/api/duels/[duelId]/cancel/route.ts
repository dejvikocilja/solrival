import { type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { findDuelById, DuelNotFoundError } from "@/server/services/duel/repo";
import { cancelDuel } from "@/server/services/duel/service";
import { cancelCreditDuel } from "@/server/services/duel/credit-duel";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { duelId } = await params;
    const duel = await findDuelById(duelId);
    if (!duel) throw new DuelNotFoundError();

    // Credits model: cancel unlocks the creator's stake instantly (no on-chain
    // refund tx). Legacy on-chain duels go through the signed cancel flow.
    if (duel.fundingMode === "CREDITS") {
      const result = await cancelCreditDuel(user, duel);
      return ok({ cancelled: true, duel: result });
    }
    const result = await cancelDuel(user, duel);
    return ok(result);
  });
}
