import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma, type Duel, type User } from "@solrival/db";
import { isValidFriendLink, type CreateDuelInput, type Game } from "@solrival/shared";
import { applyEntry, lockBalances, CreditError } from "../credits/balance";
import { toDuelSummary, DuelError } from "./service";
import { DuelConflictError } from "./repo";

/**
 * Credit-based duel flow (custodial GGDUEL balance).
 *
 * No wallet popups, no per-duel on-chain escrow: stakes are locked from each
 * player's in-platform balance (available -> locked) and the winner receives
 * the WHOLE pot — duels charge no fee under the credits model (the platform's
 * only fee is the deposit fee). Funds are conserved by the ledger: every lock,
 * refund, forfeit and payout is an idempotent LedgerEntry.
 *
 * Settlement / refund are DB-only and atomic; the verifier branches on
 * `duel.fundingMode === "CREDITS"` to call these instead of the on-chain path.
 */

const DUEL_WINDOW_MS = 30 * 60 * 1000;
const CREDIT_FEE_BPS = 0; // winner takes the entire pot

const shortCode = () => randomBytes(5).toString("hex");
const inviteToken = () => randomBytes(24).toString("base64url");

function creditEconomics(stakeLamports: bigint) {
  const pot = stakeLamports * 2n;
  return {
    stakeLamports: stakeLamports.toString(),
    platformFeeBps: CREDIT_FEE_BPS,
    potLamports: pot.toString(),
    feeLamports: "0",
    rewardLamports: pot.toString(), // winner receives the full pot
  };
}

const insufficient = () =>
  new DuelError("INSUFFICIENT_BALANCE", "Not enough balance — deposit to your GGDUEL balance first", 402);

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Creates a duel funded from the creator's balance. The stake is locked
 * atomically and the duel opens directly to WAITING_FOR_OPPONENT (no separate
 * on-chain deposit step). Throws 402 if the balance can't cover the stake.
 */
export async function createCreditDuel(user: User, input: CreateDuelInput) {
  const rule = await prisma.duelRule.findFirst({
    where: { template: input.ruleTemplate, enabled: true },
    select: { id: true },
  });
  if (!rule) throw new DuelError("RULE_UNAVAILABLE", "Rule template is not available", 400);

  const creatorGameAccount = await prisma.gameAccount.findUnique({
    where: { userId_game: { userId: user.id, game: input.game } },
    select: { id: true },
  });

  const id = randomUUID();
  try {
    const duel = await prisma.$transaction(async (tx) => {
      const created = await tx.duel.create({
        data: {
          id,
          shortCode: shortCode(),
          inviteToken: input.visibility === "PRIVATE" ? inviteToken() : null,
          game: input.game,
          visibility: input.visibility,
          status: "WAITING_FOR_OPPONENT",
          fundingMode: "CREDITS",
          creatorId: user.id,
          creatorGameAccountId: creatorGameAccount?.id ?? null,
          creatorFriendLink: input.friendLink,
          ruleId: rule.id,
          stakeLamports: input.stakeLamports,
          platformFeeBps: CREDIT_FEE_BPS,
          escrowSeed: id, // retained for schema compatibility; no PDA for credit duels
          escrowPda: null,
          expiresAt: new Date(Date.now() + DUEL_WINDOW_MS),
          escrowFundedAt: new Date(),
        },
      });

      await applyEntry(tx, {
        userId: user.id,
        type: "STAKE_LOCK",
        idempotencyKey: `duel-lock:${id}:${user.id}`,
        deltaAvailable: -input.stakeLamports,
        deltaLocked: input.stakeLamports,
        duelId: id,
        memo: "Stake locked (duel created)",
      });

      return created;
    });

    return { duel: toDuelSummary(duel), economics: creditEconomics(input.stakeLamports) };
  } catch (e) {
    if (e instanceof CreditError && e.code === "INSUFFICIENT_FUNDS") throw insufficient();
    throw e;
  }
}

// ─── Accept ──────────────────────────────────────────────────────────────────

/**
 * Accepts an open credit duel: locks the opponent's stake and claims the slot.
 * No signature needed — funds move from the opponent's balance directly.
 */
export async function acceptCreditDuel(user: User, duel: Duel, friendLink: string) {
  if (duel.creatorId === user.id) throw new DuelError("SELF_ACCEPT", "You cannot accept your own duel", 400);
  if (duel.status !== "WAITING_FOR_OPPONENT") throw new DuelError("INVALID_STATUS", "Duel is not open for acceptance", 409);
  if (duel.expiresAt.getTime() <= Date.now()) throw new DuelError("EXPIRED", "Duel has expired", 410);
  if (!isValidFriendLink(duel.game as Game, friendLink))
    throw new DuelError("BAD_FRIEND_LINK", "Friend link does not match the duel's game", 400);

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the opponent's stake first (guards the balance), then claim the slot.
      await applyEntry(tx, {
        userId: user.id,
        type: "STAKE_LOCK",
        idempotencyKey: `duel-lock:${duel.id}:${user.id}`,
        deltaAvailable: -duel.stakeLamports,
        deltaLocked: duel.stakeLamports,
        duelId: duel.id,
        memo: "Stake locked (duel accepted)",
      });

      const now = new Date();
      const claimed = await tx.duel.updateMany({
        where: { id: duel.id, status: "WAITING_FOR_OPPONENT", opponentId: null },
        data: {
          // Credits duels are live the moment both stakes are locked — go straight
          // to ACTIVE so the verification window (from acceptedAt) starts now.
          status: "ACTIVE",
          opponentId: user.id,
          opponentFriendLink: friendLink,
          acceptedAt: now,
          activatedAt: now,
        },
      });
      if (claimed.count !== 1) throw new DuelError("CONFLICT", "This duel was already accepted", 409);

      // Enter the verification pipeline: the sweep (POST /api/internal/duels/verify)
      // reads battle logs and settles the winner, or disputes on timeout.
      await tx.verificationJob.upsert({
        where: { duelId: duel.id },
        update: { status: "QUEUED", scheduledAt: now },
        create: { duelId: duel.id, status: "QUEUED", scheduledAt: now },
      });
    });
  } catch (e) {
    if (e instanceof CreditError && e.code === "INSUFFICIENT_FUNDS") throw insufficient();
    throw e;
  }

  const updated = await prisma.duel.findUniqueOrThrow({ where: { id: duel.id } });
  return { duel: toDuelSummary(updated), economics: creditEconomics(duel.stakeLamports) };
}

// ─── Cancel (creator, pre-acceptance) ────────────────────────────────────────

export async function cancelCreditDuel(user: User, duel: Duel) {
  if (duel.creatorId !== user.id) throw new DuelError("FORBIDDEN", "Not your duel", 403);
  if (duel.status !== "WAITING_FOR_OPPONENT" && duel.status !== "CREATED")
    throw new DuelError("INVALID_STATUS", "Only an unaccepted duel can be cancelled", 409);

  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.duel.updateMany({
      where: { id: duel.id, status: duel.status, opponentId: null },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) throw new DuelError("CONFLICT", "Duel state changed; retry", 409);

    await applyEntry(tx, {
      userId: user.id,
      type: "STAKE_REFUND",
      idempotencyKey: `duel-refund:${duel.id}:${user.id}`,
      deltaLocked: -duel.stakeLamports,
      deltaAvailable: duel.stakeLamports,
      duelId: duel.id,
      memo: "Stake returned (duel cancelled)",
    });
  });

  return toDuelSummary(await prisma.duel.findUniqueOrThrow({ where: { id: duel.id } }));
}


// ─── Expire (unaccepted duel past its window) ────────────────────────────────

/**
 * Expires an unaccepted credit duel: transitions to EXPIRED and returns the
 * creator's locked stake to available — atomically and idempotently. Mirrors
 * cancel, but triggered by the expiry sweep instead of the creator. Shares the
 * cancel refund key, so it can never double-refund a duel that was also
 * cancelled, and is safe to re-run.
 */
export async function expireCreditDuel(duel: Duel): Promise<void> {
  if (duel.fundingMode !== "CREDITS") throw new DuelError("WRONG_MODE", "Not a credit duel", 400);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.duel.updateMany({
      where: { id: duel.id, status: { in: ["WAITING_FOR_OPPONENT", "CREATED"] }, opponentId: null },
      data: { status: "EXPIRED" },
    });
    if (moved.count !== 1) throw new DuelConflictError(); // already transitioned / raced

    await applyEntry(tx, {
      userId: duel.creatorId,
      type: "STAKE_REFUND",
      idempotencyKey: `duel-refund:${duel.id}:${duel.creatorId}`,
      deltaLocked: -duel.stakeLamports,
      deltaAvailable: duel.stakeLamports,
      duelId: duel.id,
      memo: "Stake returned (duel expired)",
    });
  });
}

// ─── Settle (winner takes the whole pot) ─────────────────────────────────────

/**
 * Settles a credit duel: the winner receives the entire pot (2 x stake), both
 * stake locks are released, and win/loss records update — all atomically.
 * Idempotent: re-running after COMPLETED is a no-op.
 */
export async function settleCreditDuel(duelId: string, winnerId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  if (duel.status === "COMPLETED") return duel; // idempotent
  if (duel.fundingMode !== "CREDITS") throw new DuelError("WRONG_MODE", "Not a credit duel", 400);
  if (!duel.opponentId) throw new DuelError("INVALID_STATUS", "Duel has no opponent", 409);
  if (winnerId !== duel.creatorId && winnerId !== duel.opponentId)
    throw new DuelError("BAD_WINNER", "Winner must be a participant", 400);

  const loserId = winnerId === duel.creatorId ? duel.opponentId : duel.creatorId;
  const stake = duel.stakeLamports;
  const pot = stake * 2n;

  await prisma.$transaction(async (tx) => {
    // Move the duel to COMPLETED first (guards against double-settlement).
    const moved = await tx.duel.updateMany({
      where: { id: duelId, status: { in: ["ACTIVE", "VERIFYING", "DISPUTED"] } },
      data: {
        status: "COMPLETED",
        winnerId,
        winnerPayoutLamports: pot,
        feeCollectedLamports: 0n,
        settledAt: new Date(),
      },
    });
    if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel not in a settleable state", 409);

    await lockBalances(tx, [winnerId, loserId]);

    // Loser forfeits their locked stake (it flows to the winner via the pot).
    await applyEntry(tx, {
      userId: loserId,
      type: "STAKE_FORFEIT",
      idempotencyKey: `duel-forfeit:${duelId}:${loserId}`,
      deltaLocked: -stake,
      duelId,
      memo: "Stake forfeited (duel lost)",
    });
    // Winner: release own lock and receive the whole pot.
    await applyEntry(tx, {
      userId: winnerId,
      type: "DUEL_PAYOUT",
      idempotencyKey: `duel-payout:${duelId}:${winnerId}`,
      deltaLocked: -stake,
      deltaAvailable: pot,
      lifetimeWon: stake, // net winnings = opponent's stake
      duelId,
      memo: "Won duel — full pot credited",
    });

    await tx.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
    await tx.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } });
  });

  return prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
}

// ─── Refund (no winner — both stakes returned) ───────────────────────────────

/**
 * Refunds a credit duel: each player's locked stake returns to available. Used
 * for disputes resolved as refund, or verification failures. Idempotent.
 */
export async function refundCreditDuel(duelId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  if (duel.status === "REFUNDED") return duel; // idempotent
  if (duel.fundingMode !== "CREDITS") throw new DuelError("WRONG_MODE", "Not a credit duel", 400);

  const stake = duel.stakeLamports;
  const participants = [duel.creatorId, ...(duel.opponentId ? [duel.opponentId] : [])];

  await prisma.$transaction(async (tx) => {
    const moved = await tx.duel.updateMany({
      where: { id: duelId, status: { in: ["ACCEPTED", "ACTIVE", "VERIFYING", "DISPUTED"] } },
      data: { status: "REFUNDED", settledAt: new Date() },
    });
    if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel not in a refundable state", 409);

    await lockBalances(tx, participants);
    for (const userId of participants) {
      await applyEntry(tx, {
        userId,
        type: "STAKE_REFUND",
        idempotencyKey: `duel-refund:${duelId}:${userId}`,
        deltaLocked: -stake,
        deltaAvailable: stake,
        duelId,
        memo: "Stake returned (duel refunded)",
      });
    }
  });

  return prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
}
