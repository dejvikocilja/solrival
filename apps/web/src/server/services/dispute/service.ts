import { prisma, type Duel, type User } from "@solrival/db";
import { canTransition } from "@solrival/shared";
import { DuelError } from "@/server/services/duel/service";
import { publishDisputeRaised } from "@/lib/realtime/event-publisher";

/**
 * Duel statuses a participant may dispute while the match is in flight.
 * Mirrors the state machine (ACCEPTED/ACTIVE/VERIFYING → DISPUTED): the duel
 * freezes and settlement waits for admin review.
 */
const DISPUTABLE_LIVE: ReadonlySet<string> = new Set(["ACCEPTED", "ACTIVE", "VERIFYING"]);

/**
 * How long after settlement a participant may still contest the result.
 * Post-settlement disputes don't freeze the duel (the result stands unless an
 * admin overturns or voids it) but DO freeze both participants' withdrawals
 * while open — that's what makes a later clawback safe.
 */
export function disputeWindowHours(): number {
  const raw = process.env["DISPUTE_WINDOW_HOURS"];
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 48;
}

/** True while a settled duel is still inside the post-settlement dispute window. */
export function isWithinDisputeWindow(duel: Pick<Duel, "settledAt">, now = new Date()): boolean {
  if (!duel.settledAt) return false;
  return now.getTime() - duel.settledAt.getTime() <= disputeWindowHours() * 3_600_000;
}

/**
 * Raises a dispute on a duel:
 *  - caller must be a participant (creator or opponent)
 *  - duel must be live (ACCEPTED/ACTIVE/VERIFYING) — OR settled (COMPLETED)
 *    within the post-settlement dispute window
 *  - one dispute per duel (DB-unique on duelId)
 *
 * Live duels move atomically to DISPUTED (funds stay locked) with a race guard
 * so two concurrent raises — or a raise racing settlement — can never
 * double-apply. Settled duels keep their status: stats and history remain
 * truthful, the open Dispute row is the review state, and the existing
 * withdrawal guard (activeDisputeReason) freezes both players' withdrawals
 * until the admin resolves it — upholding, overturning, or voiding the result.
 *
 * The counterparty is notified either way; they're the one affected by a
 * frozen match or a contested result.
 */
export async function raiseDispute(user: User, duel: Duel, reason: string): Promise<void> {
  const isParticipant = duel.creatorId === user.id || duel.opponentId === user.id;
  if (!isParticipant) throw new DuelError("FORBIDDEN", "Only duel participants can raise a dispute", 403);

  const live = DISPUTABLE_LIVE.has(duel.status);
  const settled = duel.status === "COMPLETED";

  if (!live && !settled) {
    throw new DuelError(
      "NOT_DISPUTABLE",
      duel.status === "DISPUTED"
        ? "This duel is already under dispute"
        : "This duel can no longer be disputed",
      409,
    );
  }
  if (settled && !isWithinDisputeWindow(duel)) {
    throw new DuelError(
      "DISPUTE_WINDOW_CLOSED",
      `Results can be contested up to ${disputeWindowHours()} hours after settlement — this window has closed`,
      409,
    );
  }
  // Defence-in-depth for the live path: never bypass the shared state machine.
  if (live && !canTransition(duel.status as Parameters<typeof canTransition>[0], "DISPUTED")) {
    throw new DuelError("NOT_DISPUTABLE", "This duel can no longer be disputed", 409);
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (live) {
        // Claim the transition first — if the duel already left `status`
        // (settled, refunded, or disputed by the other player) this fails and
        // we roll back.
        const moved = await tx.duel.updateMany({
          where: { id: duel.id, status: duel.status },
          data: { status: "DISPUTED" },
        });
        if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel state changed — refresh and try again", 409);
      } else {
        // Settled path: re-check the row inside the transaction so a raise
        // racing an admin refund/overturn can't attach to a stale snapshot.
        const fresh = await tx.duel.findUnique({ where: { id: duel.id }, select: { status: true } });
        if (fresh?.status !== "COMPLETED")
          throw new DuelError("CONFLICT", "Duel state changed — refresh and try again", 409);
      }

      await tx.dispute.create({
        data: {
          duelId: duel.id,
          status: "OPEN",
          reason,
          raisedById: user.id,
        },
      });
    });
  } catch (e) {
    // Unique violation on duelId: a dispute row already exists (e.g. system-raised).
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
      throw new DuelError("ALREADY_DISPUTED", "A dispute already exists for this duel", 409);
    }
    throw e;
  }

  // Notify the counterparty (post-commit, so a rolled-back raise never emits).
  const counterpartyId = duel.creatorId === user.id ? duel.opponentId : duel.creatorId;
  if (counterpartyId) {
    publishDisputeRaised({
      duelId: duel.id,
      raisedByTag: user.username,
      postSettlement: settled,
      targetUserId: counterpartyId,
    });
  }
}

// ─── User-facing dispute list (profile) ───────────────────────────────────────

export interface UserDisputeView {
  id: string;
  duelId: string;
  duelShortCode: string;
  game: "CLASH_ROYALE" | "BRAWL_STARS";
  stakeLamports: string;
  status: string; // DisputeStatus
  reason: string | null;
  /** "you" | "opponent" | "system" relative to the viewing user. */
  raisedBy: "you" | "opponent" | "system";
  resolutionNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

/**
 * Disputes on any duel the user participates in, newest first — powers the
 * Disputes section on the profile page. Includes system-raised disputes
 * (verification timeouts) since those also freeze the user's funds.
 */
export async function listUserDisputes(userId: string, limit = 20): Promise<UserDisputeView[]> {
  const rows = await prisma.dispute.findMany({
    where: { duel: { OR: [{ creatorId: userId }, { opponentId: userId }] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      duel: { select: { id: true, shortCode: true, game: true, stakeLamports: true } },
    },
  });

  return rows.map((d) => ({
    id: d.id,
    duelId: d.duel.id,
    duelShortCode: d.duel.shortCode,
    game: d.duel.game,
    stakeLamports: d.duel.stakeLamports.toString(),
    status: d.status,
    reason: d.reason,
    raisedBy: d.raisedById === null ? "system" : d.raisedById === userId ? "you" : "opponent",
    resolutionNotes: d.resolutionNotes,
    createdAt: d.createdAt,
    resolvedAt: d.resolvedAt,
  }));
}
