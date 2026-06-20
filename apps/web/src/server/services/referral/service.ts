import "server-only";
import { prisma, type Deposit } from "@solrival/db";
import { applyEntry, type Tx } from "../credits/balance";
import { referralRewardBps } from "../../solana/config";

/**
 * Referral rewards. A user can be referred exactly once (Referral.refereeId is
 * unique). The referrer earns `referralRewardBps` of the referee's FIRST
 * credited deposit, paid into the referrer's available balance.
 *
 * Called inside the deposit-crediting transaction so the reward and the deposit
 * commit atomically.
 */

const BPS_DENOMINATOR = 10_000n;

/**
 * Attributes a referrer to a user by referral code (e.g. during onboarding).
 * No-op if the user is already referred or the code is their own / unknown.
 */
export async function attachReferrer(userId: string, referralCode: string): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { referredById: true } });
  if (!me || me.referredById) return false;

  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true },
  });
  if (!referrer || referrer.id === userId) return false;

  const res = await prisma.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: referrer.id },
  });
  return res.count === 1;
}

/**
 * If `deposit` is the referee's first credited deposit and they have a referrer,
 * creates the Referral edge and credits the reward. Idempotent via the unique
 * referee_id and the ledger idempotency key. Must run inside the deposit tx.
 */
export async function rewardOnFirstDeposit(tx: Tx, deposit: Deposit): Promise<void> {
  const referee = await tx.user.findUnique({
    where: { id: deposit.userId },
    select: { referredById: true },
  });
  if (!referee?.referredById) return; // not referred — nothing to do

  // Only the FIRST credited deposit qualifies. The unique referee_id on Referral
  // makes this naturally once-only, but we also guard on prior deposits.
  const priorCredited = await tx.deposit.count({
    where: { userId: deposit.userId, status: "CREDITED", id: { not: deposit.id } },
  });
  if (priorCredited > 0) return;

  const existing = await tx.referral.findUnique({ where: { refereeId: deposit.userId } });
  if (existing) return; // already rewarded

  const reward = (deposit.grossLamports * BigInt(referralRewardBps)) / BPS_DENOMINATOR;

  const referral = await tx.referral.create({
    data: {
      referrerId: referee.referredById,
      refereeId: deposit.userId,
      triggerDepositId: deposit.id,
      rewardBps: referralRewardBps,
      rewardLamports: reward,
      status: reward > 0n ? "CREDITED" : "VOID",
      creditedAt: reward > 0n ? new Date() : null,
    },
  });

  if (reward > 0n) {
    await applyEntry(tx, {
      userId: referee.referredById,
      type: "REFERRAL_REWARD",
      idempotencyKey: `referral:${referral.id}`,
      deltaAvailable: reward,
      referralId: referral.id,
      memo: `Referral reward (${referralRewardBps} bps of first deposit)`,
    });
  }
}
