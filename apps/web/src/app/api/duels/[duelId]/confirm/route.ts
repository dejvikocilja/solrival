import { type NextRequest } from "next/server";
import { confirmDuelSchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { findDuelById, DuelNotFoundError } from "@/server/services/duel/repo";
import { confirmDuel } from "@/server/services/duel/service";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";

const bodySchema = confirmDuelSchema;

export async function POST(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { phase, signature } = bodySchema.parse(await req.json());
    const { duelId } = await params;
    const duel = await findDuelById(duelId);
    if (!duel) throw new DuelNotFoundError();
    const duelSummary = await confirmDuel(user, duel, phase, signature);
    return ok({ duel: duelSummary });
  });
}
