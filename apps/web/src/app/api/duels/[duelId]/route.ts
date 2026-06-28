import { type NextRequest } from "next/server";
import { getDuelDetail, DuelNotFoundError } from "@/server/services/duel/repo";
import { getCurrentUser } from "@/server/auth/session";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    const { duelId } = await params;
    // M-001: validate UUID format before hitting Prisma (non-UUID → 404 not 500).
    if (!isValidUuid(duelId)) throw new DuelNotFoundError();
    const duel = await getDuelDetail(duelId);
    if (!duel) return fail("DUEL_NOT_FOUND", "Duel not found", 404);

    // Private duels are only visible to participants or via the invite token.
    if (duel.visibility === "PRIVATE") {
      const user = await getCurrentUser();
      const token = new URL(req.url).searchParams.get("token");
      const isParticipant = user && (user.id === duel.creatorId || user.id === duel.opponentId);
      const hasToken = duel.inviteToken && token === duel.inviteToken;
      if (!isParticipant && !hasToken) return fail("DUEL_NOT_FOUND", "Duel not found", 404);
    }

    return ok({
      duel: {
        id: duel.id,
        shortCode: duel.shortCode,
        game: duel.game,
        visibility: duel.visibility,
        status: duel.status,
        stakeLamports: duel.stakeLamports.toString(),
        platformFeeBps: duel.platformFeeBps,
        escrowPda: duel.escrowPda,
        expiresAt: duel.expiresAt.toISOString(),
        acceptedAt: duel.acceptedAt?.toISOString() ?? null,
        createdAt: duel.createdAt.toISOString(),
        winnerId: duel.winnerId,
        winnerPayoutLamports: duel.winnerPayoutLamports?.toString() ?? null,
        creator: duel.creator,
        opponent: duel.opponent,
        rule: duel.rule,
      },
    });
  });
}
