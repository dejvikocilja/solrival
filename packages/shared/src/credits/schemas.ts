import { z } from "zod";
import { base58PubkeySchema, base58SignatureSchema } from "../schemas/auth";

/**
 * Credits / custody contracts shared by the web client + server.
 *
 * Money is always lamports (1 SOL = 1e9). JSON has no BigInt, so amounts cross
 * the wire as decimal strings and are parsed to BigInt here.
 */

// ---- Economic floors --------------------------------------------------------
/** Minimum on-chain deposit we will credit (0.01 SOL) — keeps fee math sane. */
export const MIN_DEPOSIT_LAMPORTS = 10_000_000n;
/** Minimum withdrawal (0.01 SOL) — avoids dust payouts costing more in fees. */
export const MIN_WITHDRAWAL_LAMPORTS = 10_000_000n;
/** Hard ceiling guarding fat-finger inputs (1000 SOL). */
export const MAX_CREDIT_LAMPORTS = 1_000_000_000_000n;

/** A positive lamport amount supplied as a decimal string. */
export const lamportsStringSchema = z
  .string()
  .regex(/^\d+$/, "Amount must be a positive integer (lamports)")
  .transform((s) => BigInt(s));

function boundedLamports(min: bigint, label: string) {
  return lamportsStringSchema
    .refine((v) => v >= min, { message: `${label} below minimum` })
    .refine((v) => v <= MAX_CREDIT_LAMPORTS, { message: `${label} above maximum` });
}

// ---- POST /api/deposits  (client reports an on-chain transfer to treasury) --
export const confirmDepositSchema = z.object({
  /** Signature of the user's SOL transfer to the platform treasury wallet. */
  signature: base58SignatureSchema,
});
export type ConfirmDepositInput = z.infer<typeof confirmDepositSchema>;

// ---- POST /api/withdrawals  (request credits back to a wallet) --------------
export const createWithdrawalSchema = z.object({
  amountLamports: boundedLamports(MIN_WITHDRAWAL_LAMPORTS, "Withdrawal"),
  /** Destination Solana wallet; defaults server-side to the user's login wallet. */
  destinationWallet: base58PubkeySchema.optional(),
});
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;

// ---- Admin: review a held withdrawal ---------------------------------------
export const reviewWithdrawalSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().max(500).optional(),
});
export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;

// ---- GET list paging --------------------------------------------------------
export const ledgerQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

// ---- Public response shapes (BigInt already stringified) --------------------
export const balanceViewSchema = z.object({
  availableLamports: z.string(),
  lockedLamports: z.string(),
  totalLamports: z.string(),
  lifetimeDepositedLamports: z.string(),
  lifetimeWithdrawnLamports: z.string(),
  lifetimeWonLamports: z.string(),
});
export type BalanceView = z.infer<typeof balanceViewSchema>;
