import "server-only";
import { prisma, Prisma, type Deposit, type User } from "@solrival/db";
import { MIN_DEPOSIT_LAMPORTS } from "@solrival/shared";
import { applyEntry } from "../credits/balance";
import { rewardOnFirstDeposit } from "../referral/service";
import { depositFeeBps, treasuryWallet } from "../../solana/config";
import { DepositVerificationError, verifyDeposit } from "./onchain";

/**
 * Deposit crediting. The user submits the signature of a SOL transfer they made
 * to the treasury; we verify it on-chain, take the deposit fee (the platform's
 * only fee), and credit the net to their GGDUEL balance. Idempotent on the
 * transaction signature so a transfer can never be credited twice.
 */

const BPS_DENOMINATOR = 10_000n;

export class DepositError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DepositError";
  }
}

export function toDepositView(d: Deposit) {
  return {
    id: d.id,
    status: d.status,
    txSignature: d.txSignature,
    grossLamports: d.grossLamports.toString(),
    feeLamports: d.feeLamports.toString(),
    creditedLamports: d.creditedLamports.toString(),
    feeBps: d.feeBps,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
    creditedAt: d.creditedAt?.toISOString() ?? null,
  };
}

/** Terminal states — never re-verified, never re-credited. */
function isTerminal(status: Deposit["status"]): boolean {
  return status === "CREDITED" || status === "REJECTED";
}

/**
 * A DETECTED deposit whose transaction never appears on-chain within this
 * window is abandoned (dropped transaction, or a signature that was never
 * broadcast). Generous, because the cost of giving up too early on a real
 * transfer is far higher than the cost of carrying a dead row for a day.
 */
const DETECTED_ABANDON_MS = 24 * 60 * 60 * 1000;

/**
 * Phase 1 — durably record the signature, then attempt to credit it.
 *
 * The DETECTED row is written BEFORE any RPC work, so a signature the user has
 * already broadcast can never be lost to a slow RPC, a dropped websocket, a
 * closed tab, or a locked wallet. Once the row exists the sweep will finish the
 * job unattended. Idempotent on the signature; safe to call repeatedly.
 */
export async function claimDeposit(user: User, signature: string): Promise<Deposit> {
  // Owner-guarded idempotency. Tx signatures are public on-chain, so without
  // this check any authenticated user could replay a known signature and be
  // echoed another user's deposit record (amounts, wallet, timing).
  const prior = await prisma.deposit.findUnique({ where: { txSignature: signature } });
  if (prior) {
    if (prior.userId !== user.id) {
      throw new DepositError("ALREADY_CLAIMED", "This deposit belongs to a different account", 409);
    }
    return isTerminal(prior.status) ? prior : finalizeDeposit(prior, user.walletAddress);
  }

  let detected: Deposit;
  try {
    detected = await prisma.deposit.create({
      data: {
        userId: user.id,
        status: "DETECTED",
        // The wallet the funds are ASSERTED to come from. Never trusted: the
        // on-chain verifier overwrites it with the true funding wallet, and
        // credits only when the two agree.
        fromWallet: user.walletAddress,
        toTreasuryWallet: treasuryWallet.toBase58(),
        txSignature: signature,
        // Amounts are unknown until the transaction is read from the chain.
        // They are only meaningful once status is CREDITED.
        grossLamports: 0n,
        feeLamports: 0n,
        creditedLamports: 0n,
        feeBps: depositFeeBps,
      },
    });
  } catch (e) {
    // Lost the race to a concurrent claim of the same signature.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dep = await prisma.deposit.findUnique({ where: { txSignature: signature } });
      if (dep) {
        if (dep.userId !== user.id) {
          throw new DepositError("ALREADY_CLAIMED", "This deposit belongs to a different account", 409);
        }
        return isTerminal(dep.status) ? dep : finalizeDeposit(dep, user.walletAddress);
      }
    }
    throw e;
  }

  return finalizeDeposit(detected, user.walletAddress);
}

/** Marks a deposit permanently rejected with a reason. Never credits. */
function rejectDeposit(deposit: Deposit, reason: string): Promise<Deposit> {
  return prisma.deposit.update({
    where: { id: deposit.id },
    data: { status: "REJECTED", error: reason },
  });
}

/**
 * Phase 2 — read the transaction from the chain and credit if it checks out.
 *
 * Pure function of on-chain state: safe to call any number of times, from the
 * request path or the sweep. Retryable failures leave the row DETECTED for the
 * next attempt; permanent ones mark it REJECTED.
 *
 * @param expectedWallet the login wallet the funds must have come from.
 */
export async function finalizeDeposit(
  deposit: Deposit,
  expectedWallet: string,
): Promise<Deposit> {
  if (isTerminal(deposit.status)) return deposit;

  let verified;
  try {
    verified = await verifyDeposit(deposit.txSignature);
  } catch (e) {
    if (e instanceof DepositVerificationError && e.retryable) {
      if (Date.now() - deposit.createdAt.getTime() > DETECTED_ABANDON_MS) {
        return rejectDeposit(deposit, "Transaction never appeared on-chain");
      }
      // Still pending — record the reason for observability, stay DETECTED.
      return prisma.deposit.update({
        where: { id: deposit.id },
        data: { error: e.message },
      });
    }
    if (e instanceof DepositVerificationError) return rejectDeposit(deposit, e.message);
    throw e;
  }

  // Attribution guard: the funds must come from the user's own login wallet.
  if (verified.fromWallet !== expectedWallet) {
    return rejectDeposit(deposit, "Deposit was not sent from the account's connected wallet");
  }
  if (verified.grossLamports < MIN_DEPOSIT_LAMPORTS) {
    return rejectDeposit(deposit, "Deposit is below the minimum amount");
  }

  const gross = verified.grossLamports;
  const fee = (gross * BigInt(depositFeeBps)) / BPS_DENOMINATOR;
  const credited = gross - fee;

  const settled = await prisma.$transaction(async (tx) => {
    // Claim the transition exactly once. Two concurrent finalizers (request
    // path + sweep tick) can reach here together; only one wins the update,
    // and the ledger's idempotency key is a second, independent guard.
    const claimed = await tx.deposit.updateMany({
      where: { id: deposit.id, status: "DETECTED" },
      data: {
        status: "CREDITED",
        fromWallet: verified.fromWallet,
        slot: verified.slot != null ? BigInt(verified.slot) : null,
        blockTime: verified.blockTime,
        grossLamports: gross,
        feeLamports: fee,
        creditedLamports: credited,
        feeBps: depositFeeBps,
        creditedAt: new Date(),
        error: null,
      },
    });
    if (claimed.count === 0) return null; // another worker credited it

    const row = await tx.deposit.findUniqueOrThrow({ where: { id: deposit.id } });

    await applyEntry(tx, {
      userId: row.userId,
      type: "DEPOSIT_CREDIT",
      idempotencyKey: `deposit:${row.txSignature}`,
      deltaAvailable: credited,
      lifetimeDeposited: credited,
      depositId: row.id,
      memo: `Deposit ${gross} lamports, fee ${fee} (${depositFeeBps} bps)`,
    });

    // Referral reward fires atomically with the first credited deposit.
    await rewardOnFirstDeposit(tx, row);

    return row;
  });

  return settled ?? prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
}

export type DepositSweepResult = {
  checked: number;
  credited: number;
  pending: number;
  rejected: number;
};

/**
 * Finalizes deposits left DETECTED — the safety net that makes a lost browser,
 * a dropped websocket, or a dead RPC a non-event. Runs on a cron; every row it
 * touches is independently idempotent.
 */
export async function sweepDetectedDeposits(limit = 25): Promise<DepositSweepResult> {
  const rows = await prisma.deposit.findMany({
    where: { status: "DETECTED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { walletAddress: true } } },
  });

  const result: DepositSweepResult = { checked: rows.length, credited: 0, pending: 0, rejected: 0 };

  for (const row of rows) {
    const { user, ...deposit } = row;
    try {
      const after = await finalizeDeposit(deposit, user.walletAddress);
      if (after.status === "CREDITED") result.credited += 1;
      else if (after.status === "REJECTED") result.rejected += 1;
      else result.pending += 1;
    } catch (err) {
      // One bad row must never stall the queue behind it.
      result.pending += 1;
      console.warn({
        msg: "deposit_sweep_error",
        depositId: deposit.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export function listDeposits(userId: string, opts: { cursor?: string; limit: number }) {
  return prisma.deposit
    .findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    })
    .then((rows) => ({
      deposits: rows.map(toDepositView),
      nextCursor: rows.length === opts.limit ? (rows[rows.length - 1]?.id ?? null) : null,
    }));
}

/** The treasury address + current deposit fee, for the deposit UI. */
export function depositConfig() {
  return {
    treasuryWallet: treasuryWallet.toBase58(),
    depositFeeBps,
    minDepositLamports: MIN_DEPOSIT_LAMPORTS.toString(),
  };
}
