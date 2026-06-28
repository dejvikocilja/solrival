import "server-only";
import {
  prisma,
  type User,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from "@solrival/db";
import { assertWithdrawalTransition } from "@solrival/shared";
import { PublicKey } from "@solana/web3.js";
import { applyEntry, CreditError } from "../credits/balance";
import { sendFromTreasury } from "../../solana/treasury";

/** Platform fee on withdrawals, in basis points (NEXT_PUBLIC_WITHDRAWAL_FEE_BPS).
 *  The user receives the amount minus this fee; the fee stays in the treasury. */
const WITHDRAWAL_FEE_BPS = Number(process.env.NEXT_PUBLIC_WITHDRAWAL_FEE_BPS ?? "200"); // 2%

/**
 * Withdrawal lifecycle + fraud control.
 *
 * Funds are LOCKED the instant a request is created (moved available -> locked),
 * so a user can never double-spend or double-withdraw the same credits. A
 * request auto-approves only when the user has NO active dispute; otherwise it
 * is held PENDING_REVIEW for an admin. SOL leaves the treasury exactly once, on
 * COMPLETED. REJECTED / FAILED revert the lock back to available.
 */

export class WithdrawalError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "WithdrawalError";
  }
}

export function toWithdrawalView(w: WithdrawalRequest) {
  return {
    id: w.id,
    status: w.status,
    amountLamports: w.amountLamports.toString(),
    destinationWallet: w.destinationWallet,
    autoApproved: w.autoApproved,
    heldReason: w.heldReason,
    reviewNotes: w.reviewNotes,
    txSignature: w.txSignature,
    createdAt: w.createdAt.toISOString(),
    reviewedAt: w.reviewedAt?.toISOString() ?? null,
    completedAt: w.completedAt?.toISOString() ?? null,
  };
}

/**
 * Detects whether a user has an active dispute that should block auto-approval.
 * Returns a human reason if blocked, else null. "Active" = an open/under-review
 * Dispute on any duel they're part of, or any duel of theirs in DISPUTED state.
 */
export async function activeDisputeReason(userId: string): Promise<string | null> {
  const openDispute = await prisma.dispute.findFirst({
    where: {
      status: { in: ["OPEN", "UNDER_REVIEW"] },
      duel: { OR: [{ creatorId: userId }, { opponentId: userId }] },
    },
    select: { id: true },
  });
  if (openDispute) return "You have an open dispute under review";

  const disputedDuel = await prisma.duel.findFirst({
    where: { status: "DISPUTED", OR: [{ creatorId: userId }, { opponentId: userId }] },
    select: { id: true },
  });
  if (disputedDuel) return "You have a duel currently in dispute";

  return null;
}

// ─── Status helper ───────────────────────────────────────────────────────────

/** Guarded status transition; returns false if the row was no longer in `from`. */
async function transition(
  id: string,
  from: WithdrawalStatus,
  to: WithdrawalStatus,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  assertWithdrawalTransition(from, to);
  const res = await prisma.withdrawalRequest.updateMany({
    where: { id, status: from },
    data: { status: to, ...data },
  });
  return res.count === 1;
}

// ─── User: request a withdrawal ──────────────────────────────────────────────

export async function requestWithdrawal(
  user: User,
  amountLamports: bigint,
  destinationWallet?: string,
): Promise<WithdrawalRequest> {
  const destination = destinationWallet ?? user.walletAddress;
  try {
    new PublicKey(destination); // validate address shape
  } catch {
    throw new WithdrawalError("BAD_DESTINATION", "Invalid destination wallet", 400);
  }

  const reason = await activeDisputeReason(user.id);
  const status: WithdrawalStatus = reason ? "PENDING_REVIEW" : "APPROVED";

  try {
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          status,
          amountLamports,
          destinationWallet: destination,
          autoApproved: !reason,
          heldReason: reason,
        },
      });

      // Lock the funds (available -> locked). Throws INSUFFICIENT_FUNDS and rolls
      // back the whole request if the balance can't cover it.
      await applyEntry(tx, {
        userId: user.id,
        type: "WITHDRAWAL_LOCK",
        idempotencyKey: `wd-lock:${withdrawal.id}`,
        deltaAvailable: -amountLamports,
        deltaLocked: amountLamports,
        withdrawalId: withdrawal.id,
        memo: `Withdrawal requested to ${destination}`,
      });

      return withdrawal;
    });
  } catch (e) {
    if (e instanceof CreditError && e.code === "INSUFFICIENT_FUNDS") {
      throw new WithdrawalError("INSUFFICIENT_FUNDS", "Not enough available balance to withdraw", 402);
    }
    throw e;
  }
}

// ─── Worker: pay out an approved withdrawal ──────────────────────────────────

/**
 * Sends SOL from the treasury for one APPROVED withdrawal and settles the lock.
 * Idempotent at the status level (APPROVED -> PROCESSING claim). Intended to be
 * driven by a keeper/worker, not a request handler. On payout failure the lock
 * is reverted and the row marked FAILED (retryable).
 */
export async function processWithdrawal(withdrawalId: string): Promise<WithdrawalRequest> {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!w) throw new WithdrawalError("NOT_FOUND", "Withdrawal not found", 404);
  if (w.status !== "APPROVED") throw new WithdrawalError("NOT_PAYABLE", "Withdrawal is not approved", 409);

  // Claim it so only one worker processes it.
  const claimed = await transition(withdrawalId, "APPROVED", "PROCESSING", { processedAt: new Date() });
  if (!claimed) throw new WithdrawalError("RACE", "Withdrawal already being processed", 409);

  // Withdrawal fee: user receives the requested amount minus the fee. The full
  // requested amount leaves their locked balance; the fee stays in the treasury.
  const feeLamports = (w.amountLamports * BigInt(WITHDRAWAL_FEE_BPS)) / 10_000n;
  const netLamports = w.amountLamports - feeLamports;

  try {
    const { signature } = await sendFromTreasury(new PublicKey(w.destinationWallet), netLamports);

    await prisma.$transaction(async (tx) => {
      await applyEntry(tx, {
        userId: w.userId,
        type: "WITHDRAWAL_SETTLE",
        idempotencyKey: `wd-settle:${w.id}`,
        deltaLocked: -w.amountLamports, // full requested amount leaves the platform
        lifetimeWithdrawn: netLamports, // what the user actually received on-chain
        withdrawalId: w.id,
        memo: `Withdrawal paid: ${signature} (fee ${WITHDRAWAL_FEE_BPS}bps)`,
      });
      await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: { status: "COMPLETED", txSignature: signature, completedAt: new Date(), error: null },
      });
    });

    return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: w.id } });
  } catch (err) {
    // Payout failed — revert the lock and mark FAILED for retry.
    await prisma.$transaction(async (tx) => {
      await applyEntry(tx, {
        userId: w.userId,
        type: "WITHDRAWAL_REVERT",
        idempotencyKey: `wd-revert:${w.id}`,
        deltaLocked: -w.amountLamports,
        deltaAvailable: w.amountLamports,
        withdrawalId: w.id,
        memo: "Withdrawal payout failed — funds returned",
      });
      await tx.withdrawalRequest.updateMany({
        where: { id: w.id, status: "PROCESSING" },
        data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
      });
    });
    throw new WithdrawalError("PAYOUT_FAILED", "On-chain payout failed; funds returned to balance", 502);
  }
}

/** Processes every approved withdrawal (keeper sweep). Returns per-id results. */
export async function processApprovedWithdrawals(limit = 25) {
  const due = await prisma.withdrawalRequest.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await processWithdrawal(id);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

// ─── Admin: review a held withdrawal ─────────────────────────────────────────

export async function reviewWithdrawal(
  admin: User,
  withdrawalId: string,
  decision: "APPROVE" | "REJECT",
  notes?: string,
): Promise<WithdrawalRequest> {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!w) throw new WithdrawalError("NOT_FOUND", "Withdrawal not found", 404);
  if (w.status !== "PENDING_REVIEW") {
    throw new WithdrawalError("NOT_REVIEWABLE", "Withdrawal is not awaiting review", 409);
  }

  if (decision === "APPROVE") {
    const ok = await transition(withdrawalId, "PENDING_REVIEW", "APPROVED", {
      reviewedByAdminId: admin.id,
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
    });
    if (!ok) throw new WithdrawalError("RACE", "Withdrawal state changed; retry", 409);
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "WITHDRAWAL_APPROVED",
        entityType: "WithdrawalRequest",
        entityId: withdrawalId,
        metadata: { amountLamports: w.amountLamports.toString(), notes: notes ?? null },
      },
    });
  } else {
    // Reject: revert the lock and close out.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: "PENDING_REVIEW" },
        data: {
          status: "REJECTED",
          reviewedByAdminId: admin.id,
          reviewNotes: notes ?? null,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new WithdrawalError("RACE", "Withdrawal state changed; retry", 409);
      await applyEntry(tx, {
        userId: w.userId,
        type: "WITHDRAWAL_REVERT",
        idempotencyKey: `wd-revert:${w.id}`,
        deltaLocked: -w.amountLamports,
        deltaAvailable: w.amountLamports,
        withdrawalId: w.id,
        memo: "Withdrawal rejected by admin — funds returned",
      });
    });
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "WITHDRAWAL_REJECTED",
        entityType: "WithdrawalRequest",
        entityId: withdrawalId,
        metadata: { amountLamports: w.amountLamports.toString(), notes: notes ?? null },
      },
    });
  }

  return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });
}

// ─── Read models ─────────────────────────────────────────────────────────────

export function listUserWithdrawals(userId: string, opts: { cursor?: string; limit: number }) {
  return prisma.withdrawalRequest
    .findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    })
    .then((rows) => ({
      withdrawals: rows.map(toWithdrawalView),
      nextCursor: rows.length === opts.limit ? (rows[rows.length - 1]?.id ?? null) : null,
    }));
}

export async function listWithdrawalQueue(opts: {
  status?: WithdrawalStatus;
  page: number;
  limit: number;
}) {
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: { user: { select: { username: true, walletAddress: true } } },
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);
  return {
    data: rows.map((w) => ({
      ...toWithdrawalView(w),
      user: { username: w.user.username, walletAddress: w.user.walletAddress },
    })),
    meta: { total, page: opts.page, limit: opts.limit },
  };
}
