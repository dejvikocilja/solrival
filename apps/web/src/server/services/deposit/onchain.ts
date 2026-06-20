import "server-only";
import { PublicKey } from "@solana/web3.js";
import { solanaConnection, treasuryWallet, depositCommitment } from "../../solana/config";

/**
 * Trustless deposit verification. We never trust the client's claim about a
 * deposit — we read the finalized transaction from the chain and compute the
 * exact lamports the treasury received from the user's wallet.
 */

export type VerifiedDeposit = {
  grossLamports: bigint; // net increase of the treasury balance in this tx
  fromWallet: string; // first signer (the funding wallet)
  slot: number | null;
  blockTime: Date | null;
};

export class DepositVerificationError extends Error {
  status = 400;
  code = "DEPOSIT_UNVERIFIED";
  constructor(message: string) {
    super(message);
    this.name = "DepositVerificationError";
  }
}

/**
 * Confirms `signature` is a finalized, successful transfer that increased the
 * treasury balance, and returns the gross amount + funding wallet. Throws
 * DepositVerificationError otherwise.
 */
export async function verifyDeposit(signature: string): Promise<VerifiedDeposit> {
  const tx = await solanaConnection.getTransaction(signature, {
    commitment: depositCommitment,
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new DepositVerificationError("Transaction not found or not yet finalized");
  if (tx.meta?.err) throw new DepositVerificationError("Transaction failed on-chain");

  const keys = tx.transaction.message.getAccountKeys();
  const treasuryStr = treasuryWallet.toBase58();

  // Locate the treasury account and measure how much it gained in this tx.
  let treasuryIndex = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys.get(i)?.toBase58() === treasuryStr) {
      treasuryIndex = i;
      break;
    }
  }
  if (treasuryIndex === -1) {
    throw new DepositVerificationError("Transaction does not touch the treasury wallet");
  }

  const pre = tx.meta?.preBalances?.[treasuryIndex];
  const post = tx.meta?.postBalances?.[treasuryIndex];
  if (pre == null || post == null) throw new DepositVerificationError("Missing balance metadata");

  const gross = BigInt(post) - BigInt(pre);
  if (gross <= 0n) throw new DepositVerificationError("Treasury balance did not increase");

  // The funding wallet is the fee payer / first signer of the transfer.
  const fromWallet = keys.get(0)?.toBase58();
  if (!fromWallet) throw new DepositVerificationError("Could not determine funding wallet");

  return {
    grossLamports: gross,
    fromWallet,
    slot: tx.slot ?? null,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
  };
}

/** Throws unless `addr` is a valid base58 Solana address. */
export function assertPubkey(addr: string): PublicKey {
  return new PublicKey(addr);
}
