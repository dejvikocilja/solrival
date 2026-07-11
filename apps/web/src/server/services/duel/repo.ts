import "server-only";
import { prisma, Prisma, type Duel, type DuelStatus } from "@solrival/db";
import { assertTransition, EXPIRABLE_STATUSES } from "@solrival/shared";

/**
 * Duel persistence. All status changes go through guarded, conditional updates
 * so concurrent requests can never double-transition or race a claim.
 */

export class DuelConflictError extends Error {
  status = 409;
  code = "DUEL_CONFLICT";
  constructor(message = "Duel state changed; please retry") {
    super(message);
    this.name = "DuelConflictError";
  }
}

export class DuelNotFoundError extends Error {
  status = 404;
  code = "DUEL_NOT_FOUND";
  constructor() {
    super("Duel not found");
    this.name = "DuelNotFoundError";
  }
}

export function findDuelById(id: string) {
  return prisma.duel.findUnique({ where: { id } });
}

export function getDuelDetail(id: string) {
  return prisma.duel.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, walletAddress: true } },
      opponent: { select: { id: true, username: true, walletAddress: true } },
      rule: true,
      // Lets the detail page show "result under review" and hide the dispute
      // CTA once one exists (one dispute per duel).
      dispute: { select: { status: true, createdAt: true, raisedById: true } },
    },
  });
}

export async function createDuelRecord(data: {
  id: string;
  shortCode: string;
  inviteToken: string | null;
  game: "CLASH_ROYALE" | "BRAWL_STARS";
  visibility: "PUBLIC" | "PRIVATE";
  creatorId: string;
  creatorGameAccountId: string | null;
  creatorFriendLink: string;
  ruleId: string;
  stakeLamports: bigint;
  platformFeeBps: number;
  escrowSeed: string;
  escrowPda: string;
  expiresAt: Date;
}): Promise<Duel> {
  return prisma.duel.create({
    data: { ...data, status: "CREATED" },
  });
}

/**
 * Atomically moves a duel from `from` to `to` (validated against the state
 * machine first). Returns the updated row, or throws DuelConflictError if the
 * duel was no longer in `from` (lost a race / already transitioned).
 */
export async function transitionStatus(
  id: string,
  from: DuelStatus,
  to: DuelStatus,
  extra: Prisma.DuelUpdateManyMutationInput = {},
): Promise<Duel> {
  assertTransition(from, to);
  const res = await prisma.duel.updateMany({
    where: { id, status: from },
    data: { status: to, ...extra },
  });
  if (res.count !== 1) throw new DuelConflictError();
  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) throw new DuelNotFoundError();
  return duel;
}

/**
 * Atomically claims an open public/private duel for an opponent:
 * WAITING_FOR_OPPONENT + no opponent -> ACCEPTED with opponent set. Only one
 * concurrent caller can win.
 */
export async function claimOpponent(
  id: string,
  opponentId: string,
  opponentFriendLink: string,
  opponentGameAccountId: string,
): Promise<Duel> {
  const res = await prisma.duel.updateMany({
    where: { id, status: "WAITING_FOR_OPPONENT", opponentId: null },
    data: {
      status: "ACCEPTED",
      opponentId,
      opponentGameAccountId,
      opponentFriendLink,
      acceptedAt: new Date(),
    },
  });
  if (res.count !== 1) throw new DuelConflictError("This duel was already accepted");
  const duel = await prisma.duel.findUnique({ where: { id } });
  if (!duel) throw new DuelNotFoundError();
  return duel;
}

/** Upserts an escrow ledger row keyed by idempotency key (safe to retry). */
export async function upsertEscrowTx(data: {
  duelId: string;
  type: "DEPOSIT_CREATOR" | "DEPOSIT_OPPONENT" | "REFUND_CREATOR" | "REFUND_OPPONENT" | "PAYOUT_WINNER" | "PAYOUT_FEE";
  amountLamports: bigint;
  idempotencyKey: string;
  fromWallet?: string;
  toWallet?: string;
}) {
  return prisma.escrowTransaction.upsert({
    where: { idempotencyKey: data.idempotencyKey },
    update: {},
    create: { ...data, status: "PENDING" },
  });
}

export async function markEscrowTxConfirmed(idempotencyKey: string, signature: string) {
  return prisma.escrowTransaction.updateMany({
    where: { idempotencyKey },
    data: { status: "CONFIRMED", signature },
  });
}

/** Marketplace: public, joinable duels with creator stats; filtered + sorted. */
export function listJoinableDuels(filter: {
  game?: "CLASH_ROYALE" | "BRAWL_STARS";
  minStakeLamports?: bigint;
  maxStakeLamports?: bigint;
  minTrophies?: number;
  maxTrophies?: number;
  minAccountLevel?: number;
  maxAccountLevel?: number;
  minWinRateBps?: number;
  sort: "EXPIRING_SOON" | "NEWEST" | "STAKE_HIGH" | "STAKE_LOW";
  cursor?: string;
  limit: number;
}) {
  const orderBy: Prisma.DuelOrderByWithRelationInput[] =
    filter.sort === "NEWEST"
      ? [{ createdAt: "desc" }, { id: "asc" }]
      : filter.sort === "STAKE_HIGH"
        ? [{ stakeLamports: "desc" }, { id: "asc" }]
        : filter.sort === "STAKE_LOW"
          ? [{ stakeLamports: "asc" }, { id: "asc" }]
          : [{ expiresAt: "asc" }, { id: "asc" }]; // EXPIRING_SOON (default)

  const stake =
    filter.minStakeLamports != null || filter.maxStakeLamports != null
      ? {
          stakeLamports: {
            ...(filter.minStakeLamports != null ? { gte: filter.minStakeLamports } : {}),
            ...(filter.maxStakeLamports != null ? { lte: filter.maxStakeLamports } : {}),
          },
        }
      : {};

  // Trophy / level / win-rate filter the creator's linked game account for this game.
  const accountConstraints: Prisma.GameAccountWhereInput = {
    ...(filter.minTrophies != null || filter.maxTrophies != null
      ? {
          trophies: {
            ...(filter.minTrophies != null ? { gte: filter.minTrophies } : {}),
            ...(filter.maxTrophies != null ? { lte: filter.maxTrophies } : {}),
          },
        }
      : {}),
    ...(filter.minAccountLevel != null || filter.maxAccountLevel != null
      ? {
          accountLevel: {
            ...(filter.minAccountLevel != null ? { gte: filter.minAccountLevel } : {}),
            ...(filter.maxAccountLevel != null ? { lte: filter.maxAccountLevel } : {}),
          },
        }
      : {}),
    ...(filter.minWinRateBps != null ? { winRateBps: { gte: filter.minWinRateBps } } : {}),
  };
  const hasAccountFilter = Object.keys(accountConstraints).length > 0;

  return prisma.duel.findMany({
    where: {
      visibility: "PUBLIC",
      status: "WAITING_FOR_OPPONENT",
      expiresAt: { gt: new Date() },
      ...(filter.game ? { game: filter.game } : {}),
      ...stake,
      ...(hasAccountFilter ? { creatorGameAccount: { is: accountConstraints } } : {}),
    },
    orderBy,
    take: filter.limit,
    ...(filter.cursor ? { skip: 1, cursor: { id: filter.cursor } } : {}),
    include: {
      creator: { select: { username: true, walletAddress: true, wins: true, losses: true } },
      creatorGameAccount: {
        select: { trophies: true, accountLevel: true, winRateBps: true, verified: true },
      },
      rule: { select: { template: true, displayName: true } },
    },
  });
}

/** All duels a user participates in (creator or opponent), newest first. */
export function listUserDuels(userId: string, limit = 100) {
  return prisma.duel.findMany({
    where: { OR: [{ creatorId: userId }, { opponentId: userId }] },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      creator: { select: { username: true, walletAddress: true } },
      opponent: { select: { username: true, walletAddress: true } },
      rule: { select: { template: true, displayName: true } },
    },
  });
}

/** Pre-acceptance duels past their expiry, for the sweep job. */
export function findExpiredDuels(limit = 200) {
  return prisma.duel.findMany({
    where: { status: { in: EXPIRABLE_STATUSES as DuelStatus[] }, expiresAt: { lt: new Date() } },
    take: limit,
    orderBy: { expiresAt: "asc" },
  });
}
