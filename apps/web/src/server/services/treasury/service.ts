import "server-only";
import { prisma } from "@solrival/db";
import { solanaConnection, treasuryWallet } from "../../solana/config";

/**
 * Treasury accounting.
 *
 * The treasury wallet is custodial: it holds SOL belonging to users (their
 * credit balances) PLUS the fees the platform has earned. The one question
 * this report must answer correctly is:
 *
 *     how much can the operator withdraw without leaving users unable to cash out?
 *
 * The answer is NOT the wallet balance — most of it is owed back:
 *
 *     safeToWithdraw = expectedBalance − userLiabilities − buffer
 *
 * where `userLiabilities` is every lamport of user credit (available AND
 * locked in live duels / pending withdrawals), and the buffer absorbs network
 * fees and in-flight payouts. Withdrawing beyond this makes the platform
 * insolvent — some user's cash-out would bounce.
 *
 * `expectedBalance` is derived from our own books (deposits in − payouts out):
 * it is what the wallet SHOULD hold. `onChainBalance` is what it ACTUALLY
 * holds, read live from the chain. The two are reported side by side and their
 * difference is the reconciliation signal — books agreeing with themselves
 * proves nothing, since a bug that miscounts a payout miscounts it in both
 * directions. Only the chain is ground truth.
 *
 * All arithmetic is bigint (lamports) end-to-end; values cross the wire as
 * decimal strings so no precision is lost in JSON.
 */

/** Reserve held back from "safe to withdraw" for network fees / in-flight payouts. */
const SAFETY_BUFFER_LAMPORTS = 50_000_000n; // 0.05 SOL

/**
 * Lamports the treasury held before the first deposit (initial funding), plus
 * any manual operator top-ups. Without it the reconciliation reports the
 * opening balance as unexplained surplus forever. Set once, in env.
 */
const TREASURY_BASELINE_LAMPORTS = BigInt(
  process.env["TREASURY_BASELINE_LAMPORTS"] ?? "0",
);

/**
 * Tolerance before a mismatch is flagged. Absorbs the per-payout network fee
 * the treasury pays (~5000 lamports) and rounding at the edges.
 */
const RECONCILE_TOLERANCE_LAMPORTS = 10_000_000n; // 0.01 SOL

/** Most recent treasury movements shown in the ledger table. */
const FLOW_LIMIT = 40;

/** Withdrawal fee rate, used only to reconstruct fees for legacy rows (see below). */
const WITHDRAWAL_FEE_BPS = BigInt(process.env["NEXT_PUBLIC_WITHDRAWAL_FEE_BPS"] ?? "50");

export interface TreasurySummary {
  /** Operator capital placed in the wallet before/outside user deposits. */
  baselineLamports: string;
  depositsInLamports: string;
  withdrawalsOutLamports: string;
  expectedBalanceLamports: string;
  depositFeesLamports: string;
  withdrawalFeesLamports: string;
  duelRakeLamports: string;
  totalProfitLamports: string;
  userLiabilitiesLamports: string;
  safeToWithdrawLamports: string;
  safetyBufferLamports: string;
  insolvent: boolean;
  counts: { deposits: number; withdrawals: number; settledDuels: number };
}

/**
 * Live comparison of the books against the chain.
 *
 * `status`:
 *   ok      — within tolerance; books and chain agree
 *   surplus — chain holds MORE than the books explain. Usually a manual
 *             top-up or an unclaimed deposit; benign but worth knowing.
 *   deficit — chain holds LESS than the books say it should. Serious: either
 *             SOL left outside the payout path or a payout was double-sent.
 *   unavailable — the RPC read failed. NOT treated as agreement.
 */
export interface TreasuryReconciliation {
  onChainBalanceLamports: string | null;
  /** baseline + deposits in − payouts out. */
  expectedOnChainLamports: string;
  /** onChain − expectedOnChain. Positive = surplus, negative = deficit. */
  driftLamports: string | null;
  baselineLamports: string;
  toleranceLamports: string;
  status: "ok" | "surplus" | "deficit" | "unavailable";
  /** True when the REAL balance can't cover what users are owed. This is the
   *  solvency test that matters — the book-derived one can't see reality. */
  onChainInsolvent: boolean | null;
  checkedAt: string;
  error: string | null;
  treasuryWallet: string;
}

export interface TreasuryFlow {
  id: string;
  kind: "DEPOSIT" | "WITHDRAWAL" | "DUEL_RAKE";
  /** Signed treasury delta in lamports: positive = SOL in, negative = SOL out. */
  deltaLamports: string;
  /** Platform fee kept from this movement. */
  feeLamports: string;
  username: string | null;
  txSignature: string | null;
  at: string;
}

export interface TreasuryReport {
  summary: TreasurySummary;
  reconciliation: TreasuryReconciliation;
  flows: TreasuryFlow[];
}

/** Reads the treasury's real balance. Never throws: an RPC outage must degrade
 *  the panel to "unavailable", not blank the whole treasury page. */
async function readOnChainBalance(): Promise<{ lamports: bigint | null; error: string | null }> {
  try {
    const lamports = await solanaConnection.getBalance(treasuryWallet, "confirmed");
    return { lamports: BigInt(lamports), error: null };
  } catch (e) {
    return { lamports: null, error: e instanceof Error ? e.message : "RPC unavailable" };
  }
}

export async function getTreasuryReport(): Promise<TreasuryReport> {
  const [deposits, withdrawals, settledDuels, balances, onChain] = await Promise.all([
    prisma.deposit.findMany({
      where: { status: "CREDITED" },
      select: {
        id: true,
        grossLamports: true,
        feeLamports: true,
        txSignature: true,
        createdAt: true,
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.withdrawalRequest.findMany({
      where: { status: "COMPLETED" },
      select: {
        id: true,
        amountLamports: true,
        feeLamports: true,
        txSignature: true,
        completedAt: true,
        createdAt: true,
        user: { select: { username: true } },
      },
      orderBy: { completedAt: "desc" },
    }),
    prisma.duel.findMany({
      where: { status: "COMPLETED", feeCollectedLamports: { not: null } },
      select: { id: true, feeCollectedLamports: true, settledAt: true },
      orderBy: { settledAt: "desc" },
    }),
    prisma.userBalance.aggregate({
      _sum: { availableLamports: true, lockedLamports: true },
    }),
    readOnChainBalance(),
  ]);

  // ── Money in / out of the wallet ──
  // Deposits: the FULL gross amount lands in the treasury (the fee is simply
  // not credited to the user, so it stays with us — no separate transfer).
  const depositsIn: bigint = deposits.reduce((sum: bigint, d) => sum + BigInt(d.grossLamports), 0n);
  const depositFees: bigint = deposits.reduce((sum: bigint, d) => sum + BigInt(d.feeLamports), 0n);

  // Withdrawals: the user is debited the gross amount, but only the NET leaves
  // the wallet on-chain (the fee stays behind). `feeLamports` is recorded at
  // payout; older rows predate that column, so reconstruct at the current rate.
  const withdrawalFee = (w: { amountLamports: bigint; feeLamports: bigint | null }): bigint =>
    w.feeLamports !== null
      ? BigInt(w.feeLamports)
      : (BigInt(w.amountLamports) * WITHDRAWAL_FEE_BPS) / 10_000n;

  const withdrawalFees: bigint = withdrawals.reduce(
    (sum: bigint, w) => sum + withdrawalFee(w),
    0n,
  );
  const withdrawalsOut: bigint = withdrawals.reduce(
    (sum: bigint, w) => sum + (BigInt(w.amountLamports) - withdrawalFee(w)),
    0n,
  );

  // Duel rake moves no SOL: it's an internal ledger cut of a credit pot that
  // already sits in the treasury. It's profit, not a wallet movement.
  const duelRake: bigint = settledDuels.reduce((sum: bigint, d) => sum + BigInt(d.feeCollectedLamports ?? 0), 0n);

  // The baseline (operator's own funding of the wallet) is part of what the
  // wallet should hold. Omitting it understates the expected balance by the
  // whole opening deposit, which makes `safeToWithdraw` far too low and fires
  // a false insolvency alarm on any platform funded before its first user.
  const expectedBalance: bigint = TREASURY_BASELINE_LAMPORTS + depositsIn - withdrawalsOut;
  // Prisma aggregates come back nullable; coerce explicitly so the arithmetic
  // is unambiguously bigint (lamports) rather than depending on inferred types.
  const liabilities =
    BigInt(balances._sum.availableLamports ?? 0) + BigInt(balances._sum.lockedLamports ?? 0);

  const totalProfit: bigint = depositFees + withdrawalFees + duelRake;
  const safeToWithdrawRaw: bigint = expectedBalance - liabilities - SAFETY_BUFFER_LAMPORTS;
  const safeToWithdraw = safeToWithdrawRaw > 0n ? safeToWithdrawRaw : 0n;

  const summary: TreasurySummary = {
    baselineLamports: TREASURY_BASELINE_LAMPORTS.toString(),
    depositsInLamports: depositsIn.toString(),
    withdrawalsOutLamports: withdrawalsOut.toString(),
    expectedBalanceLamports: expectedBalance.toString(),
    depositFeesLamports: depositFees.toString(),
    withdrawalFeesLamports: withdrawalFees.toString(),
    duelRakeLamports: duelRake.toString(),
    totalProfitLamports: totalProfit.toString(),
    userLiabilitiesLamports: liabilities.toString(),
    safeToWithdrawLamports: safeToWithdraw.toString(),
    safetyBufferLamports: SAFETY_BUFFER_LAMPORTS.toString(),
    // Books say the wallet holds less than users are owed — never withdraw.
    insolvent: expectedBalance < liabilities,
    counts: {
      deposits: deposits.length,
      withdrawals: withdrawals.length,
      settledDuels: settledDuels.length,
    },
  };

  // ── Reconciliation: books vs chain ──
  // expectedBalance already includes the baseline.
  const expectedOnChain = expectedBalance;
  const drift = onChain.lamports === null ? null : onChain.lamports - expectedOnChain;

  const status: TreasuryReconciliation["status"] =
    drift === null
      ? "unavailable"
      : drift > RECONCILE_TOLERANCE_LAMPORTS
        ? "surplus"
        : drift < -RECONCILE_TOLERANCE_LAMPORTS
          ? "deficit"
          : "ok";

  const reconciliation: TreasuryReconciliation = {
    onChainBalanceLamports: onChain.lamports === null ? null : onChain.lamports.toString(),
    expectedOnChainLamports: expectedOnChain.toString(),
    driftLamports: drift === null ? null : drift.toString(),
    baselineLamports: TREASURY_BASELINE_LAMPORTS.toString(),
    toleranceLamports: RECONCILE_TOLERANCE_LAMPORTS.toString(),
    status,
    // The solvency question that actually matters: can the real wallet cover
    // every lamport users could ask for right now?
    onChainInsolvent: onChain.lamports === null ? null : onChain.lamports < liabilities,
    checkedAt: new Date().toISOString(),
    error: onChain.error,
    treasuryWallet: treasuryWallet.toBase58(),
  };

  // ── Unified movement ledger, newest first ──
  const flows: TreasuryFlow[] = [
    ...deposits.map((d) => ({
      id: `dep_${d.id}`,
      kind: "DEPOSIT" as const,
      deltaLamports: BigInt(d.grossLamports).toString(),
      feeLamports: BigInt(d.feeLamports).toString(),
      username: d.user.username,
      txSignature: d.txSignature,
      at: d.createdAt.toISOString(),
    })),
    ...withdrawals.map((w) => {
      const fee = withdrawalFee(w);
      return {
        id: `wd_${w.id}`,
        kind: "WITHDRAWAL" as const,
        deltaLamports: (-(BigInt(w.amountLamports) - fee)).toString(), // only the net leaves
        feeLamports: fee.toString(),
        username: w.user.username,
        txSignature: w.txSignature,
        at: (w.completedAt ?? w.createdAt).toISOString(),
      };
    }),
    ...settledDuels.map((d) => ({
      id: `duel_${d.id}`,
      kind: "DUEL_RAKE" as const,
      deltaLamports: "0", // internal ledger cut; no SOL moves
      feeLamports: BigInt(d.feeCollectedLamports ?? 0).toString(),
      username: null,
      txSignature: null,
      at: (d.settledAt ?? new Date(0)).toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, FLOW_LIMIT);

  return { summary, reconciliation, flows };
}
