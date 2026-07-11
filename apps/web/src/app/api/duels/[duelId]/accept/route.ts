import { type NextRequest } from "next/server";
import { acceptDuelSchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { findDuelById, DuelNotFoundError } from "@/server/services/duel/repo";
import { requestAccept } from "@/server/services/duel/service";
import { acceptCreditDuel } from "@/server/services/duel/credit-duel";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    acceptDuelSchema.parse(await req.json().catch(() => ({}))); // body intentionally empty
    const { duelId } = await params;
    const duel = await findDuelById(duelId);
    if (!duel) throw new DuelNotFoundError();

    // Credits model: accept locks the opponent's stake and joins in one step —
    // no signature / confirm round-trip. Legacy on-chain duels keep the
    // request-then-confirm flow.
    if (duel.fundingMode === "CREDITS") {
      const result = await acceptCreditDuel(user, duel);
      return ok(result);
    }
    const result = await requestAccept(user, duel);
    return ok(result);
  });
}
