import "server-only";
import { Prisma, prisma } from "@solrival/db";
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

/** Ledger page size. The movement log grows without bound, so it is paged in
 *  SQL — never assembled in memory and sliced. */
export const FLOW_PAGE_SIZE = 20;
export const MAX_FLOW_PAGE_SIZE = 100;

/** Withdrawal fee rate, used only to reconstruct fees for legacy rows (see below). */
const WITHDRAWAL_FEE_BPS = BigInt(process.env["NEXT_PUBLIC_WITHDRAWAL_FEE_BPS"] ?? "50");

export interface TreasurySummary {
  /** Operator capital placed in the wallet before/outside user deposits.
   *  Included in `expectedBalanceLamports`. */
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

export type FlowKind = "DEPOSIT" | "WITHDRAWAL" | "DUEL_RAKE";

export interface TreasuryFlowQuery {
  page: number;
  pageSize: number;
  /** Empty/undefined means all kinds. */
  kind?: FlowKind | "ALL";
  /** ISO yyyy-mm-dd bounds, inclusive. */
  from?: string;
  to?: string;
}

export interface TreasuryFlowPage {
  rows: TreasuryFlow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TreasuryReport {
  summary: TreasurySummary;
  reconciliation: TreasuryReconciliation;
  flows: TreasuryFlowPage;
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

export async function getTreasuryReport(
  flowQuery: Partial<TreasuryFlowQuery> = {},
): Promise<TreasuryReport> {
  const page = Math.max(1, Math.trunc(flowQuery.page ?? 1));
  const pageSize = Math.min(
    MAX_FLOW_PAGE_SIZE,
    Math.max(1, Math.trunc(flowQuery.pageSize ?? FLOW_PAGE_SIZE)),
  );
  const kind = flowQuery.kind && flowQuery.kind !== "ALL" ? flowQuery.kind : null;
  const fromDate = flowQuery.from ? new Date(`${flowQuery.from}T00:00:00.000Z`) : null;
  const toDate = flowQuery.to ? new Date(`${flowQuery.to}T23:59:59.999Z`) : null;
  const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
  const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;

  const [totals, balances, onChain, flowRows] = await Promise.all([
    // Every aggregate in one round trip. Previously each of these was a
    // findMany that pulled the entire table into Node just to sum it — fine at
    // 17 duels, fatal at scale.
    prisma.$queryRaw<
      [
        {
          deposits_in: bigint;
          deposit_fees: bigint;
          deposit_count: bigint;
          withdrawals_out: bigint;
          withdrawal_fees: bigint;
          withdrawal_count: bigint;
          duel_rake: bigint;
          duel_count: bigint;
        },
      ]
    >(Prisma.sql`
      SELECT
        COALESCE((SELECT SUM(gross_lamports) FROM deposits WHERE status = 'CREDITED'), 0)::bigint AS deposits_in,
        COALESCE((SELECT SUM(fee_lamports)   FROM deposits WHERE status = 'CREDITED'), 0)::bigint AS deposit_fees,
        (SELECT COUNT(*) FROM deposits WHERE status = 'CREDITED')::bigint                         AS deposit_count,
        COALESCE((
          SELECT SUM(amount_lamports - COALESCE(fee_lamports, (amount_lamports * ${WITHDRAWAL_FEE_BPS}) / 10000))
          FROM withdrawal_requests WHERE status = 'COMPLETED'
        ), 0)::bigint                                                                             AS withdrawals_out,
        COALESCE((
          SELECT SUM(COALESCE(fee_lamports, (amount_lamports * ${WITHDRAWAL_FEE_BPS}) / 10000))
          FROM withdrawal_requests WHERE status = 'COMPLETED'
        ), 0)::bigint                                                                             AS withdrawal_fees,
        (SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'COMPLETED')::bigint             AS withdrawal_count,
        COALESCE((SELECT SUM(fee_collected_lamports) FROM duels
                  WHERE status = 'COMPLETED' AND fee_collected_lamports IS NOT NULL), 0)::bigint  AS duel_rake,
        (SELECT COUNT(*) FROM duels
         WHERE status = 'COMPLETED' AND fee_collected_lamports IS NOT NULL)::bigint               AS duel_count
    `),
    prisma.userBalance.aggregate({
      _sum: { availableLamports: true, lockedLamports: true },
    }),
    readOnChainBalance(),
    // Paged movement ledger. COUNT(*) OVER() gives the unfiltered-by-page total
    // in the same scan, so the pager knows how many pages exist without a
    // second query.
    prisma.$queryRaw<
      {
        id: string;
        kind: FlowKind;
        delta_lamports: bigint;
        fee_lamports: bigint;
        username: string | null;
        tx_signature: string | null;
        at: Date;
        total: bigint;
      }[]
    >(Prisma.sql`
      WITH movements AS (
        SELECT
          'dep_' || d.id::text                       AS id,
          'DEPOSIT'                                  AS kind,
          d.gross_lamports                           AS delta_lamports,
          d.fee_lamports                             AS fee_lamports,
          u.username                                 AS username,
          d.tx_signature                             AS tx_signature,
          d.created_at                               AS at
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        WHERE d.status = 'CREDITED'

        UNION ALL

        SELECT
          'wd_' || w.id::text,
          'WITHDRAWAL',
          -(w.amount_lamports - COALESCE(w.fee_lamports, (w.amount_lamports * ${WITHDRAWAL_FEE_BPS}) / 10000)),
          COALESCE(w.fee_lamports, (w.amount_lamports * ${WITHDRAWAL_FEE_BPS}) / 10000),
          u.username,
          w.tx_signature,
          COALESCE(w.completed_at, w.created_at)
        FROM withdrawal_requests w
        JOIN users u ON u.id = w.user_id
        WHERE w.status = 'COMPLETED'

        UNION ALL

        SELECT
          'duel_' || dl.id::text,
          'DUEL_RAKE',
          0::bigint,
          dl.fee_collected_lamports,
          NULL,
          NULL,
          COALESCE(dl.settled_at, dl.created_at)
        FROM duels dl
        WHERE dl.status = 'COMPLETED' AND dl.fee_collected_lamports IS NOT NULL
      )
      SELECT m.*, COUNT(*) OVER()::bigint AS total
      FROM movements m
      WHERE (${kind}::text IS NULL OR m.kind = ${kind}::text)
        AND (${validFrom}::timestamptz IS NULL OR m.at >= ${validFrom}::timestamptz)
        AND (${validTo}::timestamptz   IS NULL OR m.at <= ${validTo}::timestamptz)
      ORDER BY m.at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
  ]);

  const t = totals[0];
  const depositsIn = t.deposits_in;
  const depositFees = t.deposit_fees;
  const withdrawalsOut = t.withdrawals_out;
  const withdrawalFees = t.withdrawal_fees;
  // Duel rake moves no SOL: it's an internal ledger cut of a credit pot that
  // already sits in the treasury. It's profit, not a wallet movement.
  const duelRake = t.duel_rake;

  // The baseline (operator's own funding of the wallet) is part of what the
  // wallet should hold. Omitting it understates the expected balance by the
  // whole opening deposit, which makes `safeToWithdraw` far too low and fires
  // a false insolvency alarm on any platform funded before its first user.
  const expectedBalance: bigint = TREASURY_BASELINE_LAMPORTS + depositsIn - withdrawalsOut;
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
    insolvent: expectedBalance < liabilities,
    counts: {
      deposits: Number(t.deposit_count),
      withdrawals: Number(t.withdrawal_count),
      settledDuels: Number(t.duel_count),
    },
  };

  // ── Reconciliation: books vs chain ──
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
    onChainInsolvent: onChain.lamports === null ? null : onChain.lamports < liabilities,
    checkedAt: new Date().toISOString(),
    error: onChain.error,
    treasuryWallet: treasuryWallet.toBase58(),
  };

  const total = flowRows.length > 0 ? Number(flowRows[0]!.total) : 0;
  const flows: TreasuryFlowPage = {
    rows: flowRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      deltaLamports: r.delta_lamports.toString(),
      feeLamports: r.fee_lamports.toString(),
      username: r.username,
      txSignature: r.tx_signature,
      at: r.at.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return { summary, reconciliation, flows };
}
