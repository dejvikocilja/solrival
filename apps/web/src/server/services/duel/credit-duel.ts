import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma, type Duel, type User } from "@solrival/db";
import { duelEconomics, type CreateDuelInput } from "@solrival/shared";
import { applyEntry, lockBalances, CreditError } from "../credits/balance";
import { toDuelSummary, DuelError } from "./service";
import { DuelConflictError } from "./repo";
import { launchMaxStakeLamports, formatSol } from "@/server/config/launch-caps";
import { requireLinkedGameAccount } from "@/server/services/game-account/service";
import {
  publishDuelAccepted,
  publishDuelExpired,
  publishRewardPaid,
} from "@/lib/realtime/event-publisher";

const LAMPORTS_PER_SOL = 1_000_000_000;
const toSol = (lamports: bigint) => Number(lamports) / LAMPORTS_PER_SOL;

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
// Platform rake on each duel pot, in basis points. Configurable via env
// (NEXT_PUBLIC_DUEL_RAKE_BPS); snapshotted onto each duel at creation.
const CREDIT_FEE_BPS = Number(process.env.NEXT_PUBLIC_DUEL_RAKE_BPS ?? "1000"); // 10%

const shortCode = () => randomBytes(5).toString("hex");
const inviteToken = () => randomBytes(24).toString("base64url");

function creditEconomics(stakeLamports: bigint) {
  const e = duelEconomics(stakeLamports, CREDIT_FEE_BPS);
  return {
    stakeLamports: e.stake.toString(),
    platformFeeBps: CREDIT_FEE_BPS,
    potLamports: e.pot.toString(),
    feeLamports: e.rake.toString(),
    rewardLamports: e.reward.toString(), // winner receives the pot minus rake
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
  // Launch cap: bounds the value at risk in any single duel while the
  // platform is young (see server/config/launch-caps.ts). The shared schema's
  // 1000 SOL ceiling still applies as the absolute input bound.
  const stakeCap = launchMaxStakeLamports();
  if (stakeCap !== null && input.stakeLamports > stakeCap) {
    throw new DuelError(
      "STAKE_ABOVE_LAUNCH_CAP",
      `Stakes are currently capped at ${formatSol(stakeCap)} SOL per duel`,
      400,
    );
  }

  const rule = await prisma.duelRule.findFirst({
    where: { template: input.ruleTemplate, enabled: true },
    select: { id: true },
  });
  if (!rule) throw new DuelError("RULE_UNAVAILABLE", "Rule template is not available", 400);

  // Every duel must be verifiable and every matched player reachable in-game:
  // require a linked game account (tag + invite link) and snapshot from it.
  const creatorGameAccount = await requireLinkedGameAccount(user.id, input.game);

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
          creatorGameAccountId: creatorGameAccount.id,
          creatorFriendLink: creatorGameAccount.friendLink,
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
export async function acceptCreditDuel(user: User, duel: Duel) {
  if (duel.creatorId === user.id) throw new DuelError("SELF_ACCEPT", "You cannot accept your own duel", 400);
  if (duel.status !== "WAITING_FOR_OPPONENT") throw new DuelError("INVALID_STATUS", "Duel is not open for acceptance", 409);
  if (duel.expiresAt.getTime() <= Date.now()) throw new DuelError("EXPIRED", "Duel has expired", 410);

  // Same requirement as creation — the acceptor's tag makes the duel
  // verifiable, and their invite link is shown to the creator.
  const opponentGameAccount = await requireLinkedGameAccount(user.id, duel.game);

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
          opponentGameAccountId: opponentGameAccount.id,
          opponentFriendLink: opponentGameAccount.friendLink,
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

  // Notify the creator their challenge was taken (after the tx commits, so a
  // rolled-back accept can never emit). The challenger doesn't need an event —
  // they performed the action and get direct UI feedback.
  const creator = await prisma.user.findUnique({
    where: { id: duel.creatorId },
    select: { username: true },
  });
  publishDuelAccepted({
    duelId: duel.id,
    creatorTag: creator?.username ?? "player",
    challengerTag: user.username,
    gameId: duel.game,
    stakeSol: toSol(duel.stakeLamports),
    targetUserId: duel.creatorId,
  });

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

  // Tell the creator their stake is back (post-commit; sweep-driven, so this is
  // often the only signal they get that the challenge lapsed).
  const creator = await prisma.user.findUnique({
    where: { id: duel.creatorId },
    select: { username: true },
  });
  publishDuelExpired({
    duelId: duel.id,
    creatorTag: creator?.username ?? "player",
    challengerTag: null,
    refundedSol: toSol(duel.stakeLamports),
    targetUserId: duel.creatorId,
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
  // Use the fee snapshotted at creation so the payout always matches the terms
  // shown when the duel was made, even if the rake config changed since.
  const { stake, rake, reward } = duelEconomics(duel.stakeLamports, duel.platformFeeBps);

  await prisma.$transaction(async (tx) => {
    // Move the duel to COMPLETED first (guards against double-settlement).
    const moved = await tx.duel.updateMany({
      where: { id: duelId, status: { in: ["ACTIVE", "VERIFYING", "DISPUTED"] } },
      data: {
        status: "COMPLETED",
        winnerId,
        winnerPayoutLamports: reward,
        feeCollectedLamports: rake,
        settledAt: new Date(),
      },
    });
    if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel not in a settleable state", 409);

    await lockBalances(tx, [winnerId, loserId]);

    // Loser forfeits their locked stake (it funds the winner's pot + platform rake).
    await applyEntry(tx, {
      userId: loserId,
      type: "STAKE_FORFEIT",
      idempotencyKey: `duel-forfeit:${duelId}:${loserId}`,
      deltaLocked: -stake,
      duelId,
      memo: "Stake forfeited (duel lost)",
    });
    // Winner: release own lock and receive the pot minus the platform rake.
    await applyEntry(tx, {
      userId: winnerId,
      type: "DUEL_PAYOUT",
      idempotencyKey: `duel-payout:${duelId}:${winnerId}`,
      deltaLocked: -stake,
      deltaAvailable: reward,
      lifetimeWon: reward - stake, // net winnings = opponent's stake minus rake
      duelId,
      memo: "Won duel — pot credited (net of platform rake)",
    });

    await tx.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
    await tx.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } });
  });

  // Payout notification for the winner (post-commit, so it can never fire for a
  // settlement that rolled back). Idempotent settlement returns early above, so
  // a re-run can't double-notify either.
  const winner = await prisma.user.findUnique({ where: { id: winnerId }, select: { username: true } });
  publishRewardPaid({
    duelId,
    winnerTag: winner?.username ?? "player",
    amountSol: toSol(reward),
    feeSol: toSol(rake),
    targetUserId: winnerId,
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
      where: {
        id: duelId,
        // Include pre-acceptance states so an admin can refund an open/expired
        // duel only the creator funded — `participants` below already resolves
        // to just the creator when there's no opponent.
        status: { in: ["WAITING_FOR_OPPONENT", "CREATED", "ACCEPTED", "ACTIVE", "VERIFYING", "DISPUTED"] },
      },
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

// ─── Post-settlement reversal (admin dispute resolution only) ─────────────────

/**
 * Overturns a settled credit duel in favour of `newWinnerId` — the admin has
 * ruled that automatic verification paid the wrong player.
 *
 * Atomically: claws the net reward back from the original winner's available
 * balance, credits it to the new winner, flips both players' win/loss records
 * and lifetime-won stats, and repoints `winnerId`. The duel stays COMPLETED —
 * the result stands, just for the other player. The platform rake is unchanged.
 *
 * Idempotent: if `winnerId` already equals `newWinnerId` (retry, or the admin
 * upheld the original result) this is a no-op.
 *
 * Throws CreditError(INSUFFICIENT_FUNDS) if the original winner's available
 * balance can't cover the clawback (e.g. they staked it on another duel).
 * Withdrawals are frozen for both participants while the dispute is open, so
 * this can only happen from credits re-locked in play — the admin resolves
 * that duel first or waits, then retries. We never allow negative balances.
 */
export async function overturnCreditSettlement(duelId: string, newWinnerId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  if (duel.fundingMode !== "CREDITS") throw new DuelError("WRONG_MODE", "Not a credit duel", 400);
  if (duel.status !== "COMPLETED" || !duel.winnerId || !duel.opponentId || duel.settledAt === null)
    throw new DuelError("NOT_SETTLED", "Only a settled duel can be overturned", 409);
  if (newWinnerId !== duel.creatorId && newWinnerId !== duel.opponentId)
    throw new DuelError("BAD_WINNER", "Winner must be a participant", 400);
  if (duel.winnerId === newWinnerId) return duel; // upheld / already overturned — idempotent

  const originalWinnerId = duel.winnerId;
  const { reward, netWinnings } = duelEconomics(duel.stakeLamports, duel.platformFeeBps); // netWinnings = lifetime-won delta applied at settlement

  await prisma.$transaction(async (tx) => {
    // Claim: repoint the winner only if the settlement we read still stands.
    const moved = await tx.duel.updateMany({
      where: { id: duelId, status: "COMPLETED", winnerId: originalWinnerId },
      data: { winnerId: newWinnerId },
    });
    if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel state changed — refresh and try again", 409);

    await lockBalances(tx, [originalWinnerId, newWinnerId]);

    // Claw the paid reward back from the player verification wrongly credited.
    await applyEntry(tx, {
      userId: originalWinnerId,
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `duel-overturn-clawback:${duelId}`,
      deltaAvailable: -reward,
      lifetimeWon: -netWinnings,
      duelId,
      memo: "Duel result overturned by dispute review — payout reversed",
    });
    // Pay the rightful winner the same net reward.
    await applyEntry(tx, {
      userId: newWinnerId,
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `duel-overturn-payout:${duelId}`,
      deltaAvailable: reward,
      lifetimeWon: netWinnings,
      duelId,
      memo: "Duel result overturned by dispute review — pot credited (net of platform rake)",
    });

    // Flip the denormalized records set at settlement.
    await tx.user.update({
      where: { id: originalWinnerId },
      data: { wins: { decrement: 1 }, losses: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: newWinnerId },
      data: { wins: { increment: 1 }, losses: { decrement: 1 } },
    });
  });

  return prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
}

/**
 * Voids a settled credit duel — the admin has ruled no fair result exists.
 *
 * Atomically: claws back the original winner's net gain, returns the loser's
 * forfeited stake, gives up the platform rake (both players end exactly where
 * they started), reverts the win/loss records, and moves the duel
 * COMPLETED → REFUNDED with the result cleared.
 *
 * Idempotent via the status claim: a duel already REFUNDED returns as-is.
 * Same INSUFFICIENT_FUNDS semantics as {@link overturnCreditSettlement}.
 */
export async function refundSettledCreditDuel(duelId: string): Promise<Duel> {
  const duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  if (duel.status === "REFUNDED") return duel; // idempotent
  if (duel.fundingMode !== "CREDITS") throw new DuelError("WRONG_MODE", "Not a credit duel", 400);
  if (duel.status !== "COMPLETED" || !duel.winnerId || !duel.opponentId || duel.settledAt === null)
    throw new DuelError("NOT_SETTLED", "Only a settled duel can be voided", 409);

  const winnerId = duel.winnerId;
  const loserId = winnerId === duel.creatorId ? duel.opponentId : duel.creatorId;
  const { stake, netWinnings } = duelEconomics(duel.stakeLamports, duel.platformFeeBps);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.duel.updateMany({
      where: { id: duelId, status: "COMPLETED", winnerId },
      data: {
        status: "REFUNDED",
        winnerId: null,
        winnerPayoutLamports: null,
        feeCollectedLamports: null,
      },
    });
    if (moved.count !== 1) throw new DuelError("CONFLICT", "Duel state changed — refresh and try again", 409);

    await lockBalances(tx, [winnerId, loserId]);

    // Winner returns their net gain (payout minus the stake they'd committed).
    await applyEntry(tx, {
      userId: winnerId,
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `duel-void-winner:${duelId}`,
      deltaAvailable: -netWinnings,
      lifetimeWon: -netWinnings,
      duelId,
      memo: "Duel voided by dispute review — net winnings reversed, stake returned",
    });
    // Loser gets their forfeited stake back in full (platform returns the rake).
    await applyEntry(tx, {
      userId: loserId,
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `duel-void-loser:${duelId}`,
      deltaAvailable: stake,
      duelId,
      memo: "Duel voided by dispute review — stake returned",
    });

    await tx.user.update({ where: { id: winnerId }, data: { wins: { decrement: 1 } } });
    await tx.user.update({ where: { id: loserId }, data: { losses: { decrement: 1 } } });
  });

  return prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
}
