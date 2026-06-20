import "server-only";
import { prisma, Prisma, type Deposit, type User } from "@solrival/db";
import { MIN_DEPOSIT_LAMPORTS } from "@solrival/shared";
import { applyEntry } from "../credits/balance";
import { rewardOnFirstDeposit } from "../referral/service";
import { depositFeeBps, treasuryWallet } from "../../solana/config";
import { verifyDeposit } from "./onchain";

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
    createdAt: d.createdAt.toISOString(),
    creditedAt: d.creditedAt?.toISOString() ?? null,
  };
}

/**
 * Verifies + credits a deposit identified by its on-chain signature.
 * Returns the (idempotent) deposit record.
 */
export async function confirmDeposit(user: User, signature: string): Promise<Deposit> {
  // Fast idempotency path: already credited this signature.
  const prior = await prisma.deposit.findUnique({ where: { txSignature: signature } });
  if (prior) return prior;

  const verified = await verifyDeposit(signature);

  // Attribution guard: the funds must come from the user's own login wallet.
  if (verified.fromWallet !== user.walletAddress) {
    throw new DepositError(
      "WALLET_MISMATCH",
      "Deposit must be sent from your connected wallet",
      400,
    );
  }
  if (verified.grossLamports < MIN_DEPOSIT_LAMPORTS) {
    throw new DepositError("BELOW_MINIMUM", "Deposit is below the minimum amount", 400);
  }

  const gross = verified.grossLamports;
  const fee = (gross * BigInt(depositFeeBps)) / BPS_DENOMINATOR;
  const credited = gross - fee;

  try {
    return await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          userId: user.id,
          status: "CREDITED",
          fromWallet: verified.fromWallet,
          toTreasuryWallet: treasuryWallet.toBase58(),
          txSignature: signature,
          slot: verified.slot != null ? BigInt(verified.slot) : null,
          blockTime: verified.blockTime,
          grossLamports: gross,
          feeLamports: fee,
          creditedLamports: credited,
          feeBps: depositFeeBps,
          creditedAt: new Date(),
        },
      });

      await applyEntry(tx, {
        userId: user.id,
        type: "DEPOSIT_CREDIT",
        idempotencyKey: `deposit:${signature}`,
        deltaAvailable: credited,
        lifetimeDeposited: credited,
        depositId: deposit.id,
        memo: `Deposit ${gross} lamports, fee ${fee} (${depositFeeBps} bps)`,
      });

      // Referral reward fires atomically with the first credited deposit.
      await rewardOnFirstDeposit(tx, deposit);

      return deposit;
    });
  } catch (e) {
    // Lost the race to another concurrent confirm of the same signature.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dep = await prisma.deposit.findUnique({ where: { txSignature: signature } });
      if (dep) return dep;
    }
    throw e;
  }
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
