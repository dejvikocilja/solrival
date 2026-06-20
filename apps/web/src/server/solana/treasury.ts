import "server-only";
import bs58 from "bs58";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { solanaConnection, treasuryWallet } from "./config";

/**
 * Platform treasury signer. Holds the keypair that custodies user deposits and
 * signs withdrawal payouts. This module is server-only and the secret is read
 * from `TREASURY_SECRET_KEY` — it must NEVER reach the browser or a NEXT_PUBLIC_
 * var. Used by the withdrawal payout worker, not by request handlers directly.
 */

let cached: Keypair | null = null;

/** Parses TREASURY_SECRET_KEY as either a base58 string or a JSON byte array. */
function parseSecret(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

/** Lazily loads + caches the treasury keypair; throws if misconfigured. */
export function loadTreasuryKeypair(): Keypair {
  if (cached) return cached;
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw || raw.trim() === "") {
    throw new Error("[treasury] TREASURY_SECRET_KEY is not set — cannot sign payouts");
  }
  const kp = parseSecret(raw);
  if (!kp.publicKey.equals(treasuryWallet)) {
    throw new Error(
      "[treasury] TREASURY_SECRET_KEY does not match NEXT_PUBLIC_TREASURY_WALLET",
    );
  }
  cached = kp;
  return kp;
}

export type TreasuryTransferResult = {
  signature: string;
  slot: number | null;
};

/**
 * Sends `lamports` from the treasury to `destination` and waits for finalization.
 * Idempotency is the caller's responsibility (guard on WithdrawalRequest status
 * + a recorded signature) — never call this twice for the same withdrawal.
 */
export async function sendFromTreasury(
  destination: PublicKey,
  lamports: bigint,
  connection: Connection = solanaConnection,
): Promise<TreasuryTransferResult> {
  const treasury = loadTreasuryKeypair();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

  const tx = new Transaction({
    feePayer: treasury.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: destination,
      lamports, // web3.js accepts number|bigint
    }),
  );

  tx.sign(treasury);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(`[treasury] payout failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  const parsed = await connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  return { signature, slot: parsed?.slot ?? null };
}
