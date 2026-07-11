import { type NextRequest } from "next/server";
import { getDuelDetail, DuelNotFoundError } from "@/server/services/duel/repo";
import { expireIfLapsed } from "@/server/services/duel/service";
import { getCurrentUser } from "@/server/auth/session";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { disputeWindowHours } from "@/server/services/dispute/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ duelId: string }> }) {
  return handle(async () => {
    const { duelId } = await params;
    // M-001: validate UUID format before hitting Prisma (non-UUID → 404 not 500).
    if (!isValidUuid(duelId)) throw new DuelNotFoundError();
    let duel = await getDuelDetail(duelId);
    if (!duel) return fail("DUEL_NOT_FOUND", "Duel not found", 404);

    // A lapsed open challenge expires (and refunds the creator's stake) the
    // moment anyone loads it — no waiting for the cron sweep.
    if (await expireIfLapsed(duel)) {
      duel = (await getDuelDetail(duelId)) ?? duel;
    }

    const user = await getCurrentUser();
    const isParticipant = !!user && (user.id === duel.creatorId || user.id === duel.opponentId);

    // Private duels are only visible to participants or via the invite token.
    if (duel.visibility === "PRIVATE") {
      const token = new URL(req.url).searchParams.get("token");
      const hasToken = duel.inviteToken && token === duel.inviteToken;
      if (!isParticipant && !hasToken) return fail("DUEL_NOT_FOUND", "Duel not found", 404);
    }

    // The OTHER player's in-game friend invite link — how the requester adds
    // their opponent in-game to actually play. Participants only; never leaked
    // to spectators.
    const opponentInviteLink = !isParticipant
      ? null
      : user!.id === duel.creatorId
        ? duel.opponentFriendLink
        : duel.creatorFriendLink;

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
        settledAt: duel.settledAt?.toISOString() ?? null,
        opponentInviteLink,
        // One dispute per duel; null until someone (or the system) raises one.
        dispute: duel.dispute
          ? { status: duel.dispute.status, createdAt: duel.dispute.createdAt.toISOString() }
          : null,
        // How long after settlement a result stays contestable — the client
        // derives CTA visibility from this instead of hardcoding the policy.
        disputeWindowHours: disputeWindowHours(),
        creator: duel.creator,
        opponent: duel.opponent,
        rule: duel.rule,
      },
    });
  });
}
