import "server-only";
import { prisma, type Duel } from "@solrival/db";
import { settleCreditDuel, refundCreditDuel, overturnCreditSettlement, refundSettledCreditDuel } from "./credit-duel";

/**
 * Unified duel settlement orchestrator.
 *
 * The single place that turns a *decision* (a winner, a refund, a dispute) into
 * money movement + duel-status changes. Branches on `duel.fundingMode`:
 *   • CREDITS        → balance ledger (settleCreditDuel / refundCreditDuel)
 *   • ONCHAIN_ESCROW → delegated to the verifier's on-chain settlement signer
 *
 * Called by BOTH automatic verification (winner detected from battle logs) and
 * admin dispute resolution, so both paths share identical, idempotent logic.
 */

export class SettlementError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

async function markVerificationJob(
  duelId: string,
  outcome: "VERIFIED_WINNER" | "VERIFICATION_FAILURE" | "DISPUTE",
  detectedWinnerId: string | null,
) {
  await prisma.verificationJob.upsert({
    where: { duelId },
    update: {
      status: "SUCCEEDED",
      outcome,
      detectedWinnerId,
      completedAt: new Date(),
    },
    create: {
      duelId,
      status: "SUCCEEDED",
      outcome,
      detectedWinnerId,
      completedAt: new Date(),
    },
  });
}

/**
 * Settles a duel in favour of `winnerUserId`. Idempotent. For credit duels the
 * winner receives the full pot from the ledger; on-chain duels are flagged for
 * the verifier's settlement signer (no DB fund move here).
 */
export async function applyVerifiedWinner(duelId: string, winnerUserId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  if (winnerUserId !== duel.creatorId && winnerUserId !== duel.opponentId) {
    throw new SettlementError("BAD_WINNER", "Winner must be a participant", 400);
  }

  let settled: Duel;
  if (duel.fundingMode === "CREDITS") {
    settled = await settleCreditDuel(duelId, winnerUserId);
  } else {
    // On-chain escrow: the verifier service holds the result-authority key and
    // builds the settle instruction. We only record the verified outcome here.
    settled = duel;
  }
  await markVerificationJob(duelId, "VERIFIED_WINNER", winnerUserId);
  return settled;
}

/**
 * Refunds a duel (no winner — draw, verification failure, or admin refund).
 * Idempotent. Credit duels return both locked stakes to available balance.
 */
export async function applyDuelRefund(duelId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });

  let refunded: Duel;
  if (duel.fundingMode === "CREDITS") {
    refunded = await refundCreditDuel(duelId);
  } else {
    refunded = duel; // on-chain refund handled by the verifier signer
  }
  await markVerificationJob(duelId, "VERIFICATION_FAILURE", null);
  return refunded;
}

/**
 * Moves a duel to DISPUTED so its funds stay locked pending admin review. Used
 * when auto-verification times out or returns irreconcilable data. Idempotent.
 */
export async function markDuelDisputed(duelId: string): Promise<void> {
  await prisma.duel.updateMany({
    where: { id: duelId, status: { in: ["ACTIVE", "VERIFYING", "ACCEPTED"] } },
    data: { status: "DISPUTED" },
  });
  await prisma.verificationJob.upsert({
    where: { duelId },
    update: { status: "SUCCEEDED", outcome: "DISPUTE", completedAt: new Date() },
    create: { duelId, status: "SUCCEEDED", outcome: "DISPUTE", completedAt: new Date() },
  });
}

/**
 * Applies the money side of an admin dispute resolution.
 *
 * PRE-settlement (duel frozen in DISPUTED, funds still locked): maps the
 * outcome to a settlement (winner paid) or a refund. REJECTED is treated as a
 * no-fault refund so funds are never stranded.
 *
 * POST-settlement (duel COMPLETED — the dispute was raised against the result
 * within the dispute window): money already moved, so the branches differ:
 *   • REJECTED, or a win for the player who already won → verdict upheld, no
 *     fund movement.
 *   • a win for the OTHER player → full ledger reversal (clawback + re-credit,
 *     records flipped) via overturnCreditSettlement.
 *   • RESOLVED_REFUND → result voided; both players restored to their pre-duel
 *     balances (platform returns the rake) via refundSettledCreditDuel.
 * Withdrawals are frozen for both participants while the dispute is open, so a
 * clawback can only fail if the credits were re-staked — surfaced to the admin
 * as a clear 409 rather than ever allowing a negative balance.
 */
export async function resolveDisputeSettlement(
  duelId: string,
  outcome: "RESOLVED_CREATOR_WIN" | "RESOLVED_OPPONENT_WIN" | "RESOLVED_REFUND" | "REJECTED",
): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });

  // ── Post-settlement path: the result exists; uphold, overturn, or void it ──
  if (duel.status === "COMPLETED") {
    if (duel.fundingMode !== "CREDITS") {
      throw new SettlementError(
        "UNSUPPORTED_MODE",
        "Post-settlement reversal is only supported for credit duels",
        409,
      );
    }
    switch (outcome) {
      case "REJECTED":
        return duel; // verdict stands untouched
      case "RESOLVED_CREATOR_WIN":
        return overturnCreditSettlement(duelId, duel.creatorId); // no-op if creator already won
      case "RESOLVED_OPPONENT_WIN":
        if (!duel.opponentId) throw new SettlementError("NO_OPPONENT", "Duel has no opponent to pay", 409);
        return overturnCreditSettlement(duelId, duel.opponentId); // no-op if opponent already won
      case "RESOLVED_REFUND":
        return refundSettledCreditDuel(duelId);
    }
  }

  // ── Pre-settlement path: funds still locked; settle or refund normally ─────
  switch (outcome) {
    case "RESOLVED_CREATOR_WIN":
      return applyVerifiedWinner(duelId, duel.creatorId);
    case "RESOLVED_OPPONENT_WIN":
      if (!duel.opponentId) throw new SettlementError("NO_OPPONENT", "Duel has no opponent to pay", 409);
      return applyVerifiedWinner(duelId, duel.opponentId);
    case "RESOLVED_REFUND":
    case "REJECTED":
      return applyDuelRefund(duelId);
  }
}
