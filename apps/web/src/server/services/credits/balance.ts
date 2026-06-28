import "server-only";
import { prisma, Prisma, type LedgerEntry, type LedgerEntryType, type UserBalance } from "@solrival/db";

/**
 * Custodial balance ledger — the economic core of the credits system.
 *
 * Invariants (enforced here AND by SQL CHECK constraints):
 *   • available_lamports >= 0 and locked_lamports >= 0 at all times.
 *   • Every balance mutation is one append-only LedgerEntry written in the SAME
 *     transaction, carrying signed deltas + the post-mutation snapshot.
 *   • Each economic event applies exactly once: LedgerEntry.idempotencyKey is
 *     unique, and we re-check it under a row lock so retries are no-ops.
 *
 * Concurrency: every mutation takes `SELECT ... FOR UPDATE` on the user's
 * balance row, so concurrent debits/credits serialize and can never overdraft
 * or double-apply. Multi-user atomic operations (duel settlement) must call
 * `lockBalances` first, in sorted order, to avoid deadlocks.
 */

export class CreditError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "CreditError";
  }
}

export const insufficientFunds = () =>
  new CreditError("INSUFFICIENT_FUNDS", "Not enough available balance", 402);

export type Tx = Prisma.TransactionClient;

export type EntryInput = {
  userId: string;
  type: LedgerEntryType;
  /** Unique per economic event — makes the entry idempotent under retries. */
  idempotencyKey: string;
  /** Signed delta applied to available_lamports (can be negative). */
  deltaAvailable?: bigint;
  /** Signed delta applied to locked_lamports (can be negative). */
  deltaLocked?: bigint;
  // optional lifetime-stat bumps (denormalized; never used for spend math)
  lifetimeDeposited?: bigint;
  lifetimeWithdrawn?: bigint;
  lifetimeWon?: bigint;
  // references to the causing event
  depositId?: string;
  withdrawalId?: string;
  duelId?: string;
  referralId?: string;
  tournamentId?: string;
  memo?: string;
};

/** Ensures a balance row exists for the user (idempotent upsert). */
export async function getOrCreateBalance(userId: string, db: Tx | typeof prisma = prisma): Promise<UserBalance> {
  return db.userBalance.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/**
 * Locks the given users' balance rows FOR UPDATE in a deterministic order.
 * Call this once at the start of any multi-user atomic operation before
 * applying entries, so lock acquisition order is globally consistent.
 */
export async function lockBalances(tx: Tx, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)].sort();
  if (unique.length === 0) return;
  // Ensure rows exist so FOR UPDATE has something to lock.
  for (const id of unique) await getOrCreateBalance(id, tx);
  await tx.$queryRaw`
    SELECT 1 FROM user_balances
    WHERE user_id = ANY(${unique}::uuid[])
    ORDER BY user_id
    FOR UPDATE`;
}

/**
 * Applies one ledger entry within an existing transaction. Idempotent: if an
 * entry with the same key already exists, returns it without re-applying.
 * Throws CreditError(INSUFFICIENT_FUNDS) if the move would push a bucket below
 * zero. Assumes the caller already locked the row (via lockBalances) for
 * multi-user ops; for single-user ops it locks the row itself.
 */
export async function applyEntry(tx: Tx, input: EntryInput): Promise<LedgerEntry> {
  const deltaAvailable = input.deltaAvailable ?? 0n;
  const deltaLocked = input.deltaLocked ?? 0n;

  await getOrCreateBalance(input.userId, tx);
  // Re-entrant row lock (no-op if lockBalances already holds it this tx).
  await tx.$queryRaw`SELECT 1 FROM user_balances WHERE user_id = ${input.userId}::uuid FOR UPDATE`;

  const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing; // already applied — exactly-once guarantee

  const bal = await tx.userBalance.findUniqueOrThrow({ where: { userId: input.userId } });
  const availableAfter = bal.availableLamports + deltaAvailable;
  const lockedAfter = bal.lockedLamports + deltaLocked;

  if (availableAfter < 0n) throw insufficientFunds();
  if (lockedAfter < 0n) throw new CreditError("LOCKED_UNDERFLOW", "Locked balance underflow", 409);

  await tx.userBalance.update({
    where: { userId: input.userId },
    data: {
      availableLamports: availableAfter,
      lockedLamports: lockedAfter,
      version: { increment: 1 },
      ...(input.lifetimeDeposited ? { lifetimeDepositedLamports: { increment: input.lifetimeDeposited } } : {}),
      ...(input.lifetimeWithdrawn ? { lifetimeWithdrawnLamports: { increment: input.lifetimeWithdrawn } } : {}),
      ...(input.lifetimeWon ? { lifetimeWonLamports: { increment: input.lifetimeWon } } : {}),
    },
  });

  return tx.ledgerEntry.create({
    data: {
      userId: input.userId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      deltaAvailable,
      deltaLocked,
      availableAfter,
      lockedAfter,
      depositId: input.depositId ?? null,
      withdrawalId: input.withdrawalId ?? null,
      duelId: input.duelId ?? null,
      referralId: input.referralId ?? null,
      tournamentId: input.tournamentId ?? null,
      memo: input.memo ?? null,
    },
  });
}

/** Standalone single-entry post, wrapped in its own transaction. */
export function postEntry(input: EntryInput): Promise<LedgerEntry> {
  return prisma.$transaction((tx) => applyEntry(tx, input));
}

// ─── Read models ─────────────────────────────────────────────────────────────

export function toBalanceView(b: UserBalance) {
  return {
    availableLamports: b.availableLamports.toString(),
    lockedLamports: b.lockedLamports.toString(),
    totalLamports: (b.availableLamports + b.lockedLamports).toString(),
    lifetimeDepositedLamports: b.lifetimeDepositedLamports.toString(),
    lifetimeWithdrawnLamports: b.lifetimeWithdrawnLamports.toString(),
    lifetimeWonLamports: b.lifetimeWonLamports.toString(),
  };
}

export async function getBalanceView(userId: string) {
  const b = await getOrCreateBalance(userId);
  return toBalanceView(b);
}

export function toLedgerView(e: LedgerEntry) {
  return {
    id: e.id,
    type: e.type,
    deltaAvailable: e.deltaAvailable.toString(),
    deltaLocked: e.deltaLocked.toString(),
    availableAfter: e.availableAfter.toString(),
    lockedAfter: e.lockedAfter.toString(),
    duelId: e.duelId,
    depositId: e.depositId,
    withdrawalId: e.withdrawalId,
    memo: e.memo,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function listLedger(userId: string, opts: { cursor?: string; limit: number }) {
  const rows = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
  const nextCursor = rows.length === opts.limit ? (rows[rows.length - 1]?.id ?? null) : null;
  return { entries: rows.map(toLedgerView), nextCursor };
}
