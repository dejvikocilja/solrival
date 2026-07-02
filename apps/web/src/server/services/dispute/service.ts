import { prisma, type Duel, type User } from "@solrival/db";
import { canTransition } from "@solrival/shared";
import { DuelError } from "@/server/services/duel/service";

/**
 * Duel statuses a participant may dispute from. Mirrors the state machine
 * (ACCEPTED/ACTIVE/VERIFYING → DISPUTED); COMPLETED is deliberately excluded —
 * settled money has moved, so post-settlement complaints go to support, not the
 * self-serve flow.
 */
const DISPUTABLE: ReadonlySet<string> = new Set(["ACCEPTED", "ACTIVE", "VERIFYING"]);

/**
 * Raises a dispute on a duel:
 *  - caller must be a participant (creator or opponent)
 *  - duel must be in a disputable status
 *  - one dispute per duel (DB-unique on duelId)
 *  - atomically: create the Dispute row AND move the duel to DISPUTED, with a
 *    race guard so two concurrent raises (or a raise racing settlement) can
 *    never double-apply.
 *
 * Settlement remains possible afterwards: the admin resolve flow settles or
 * refunds from DISPUTED per the state machine.
 */
export async function raiseDispute(user: User, duel: Duel, reason: string): Promise<void> {
  const isParticipant = duel.creatorId === user.id || duel.opponentId === user.id;
  if (!isParticipant) throw new DuelError("FORBIDDEN", "Only duel participants can raise a dispute", 403);

  if (!DISPUTABLE.has(duel.status)) {
    throw new DuelError(
      "NOT_DISPUTABLE",
      duel.status === "DISPUTED"
        ? "This duel is already under dispute"
        : "This duel can no longer be disputed",
      409,
    );
  }
  // Defence-in-depth: never bypass the shared state machine.
  if (!canTransition(duel.status as Parameters<typeof canTransition>[0], "DISPUTED")) {
    throw new DuelError("NOT_DISPUTABLE", "This duel can no longer be disputed", 409);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the transition first — if the duel already left `status` (settled,
      // refunded, or disputed by the other player) this fails and we roll back.
      const moved = await tx.duel.updateMany({
        where: { id: duel.id, status: duel.status },
        data: { status: "DISPUTED" },
      });
      if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel state changed — refresh and try again", 409);

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
}
