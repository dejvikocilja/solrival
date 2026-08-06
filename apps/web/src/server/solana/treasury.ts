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
 * Thrown when a payout transaction WAS broadcast but its outcome could not be
 * established (RPC dropped, confirmation timed out).
 *
 * This is deliberately a distinct type, because it demands the opposite
 * response from an ordinary failure. A pre-broadcast failure means no lamports
 * moved and the lock must be reverted. An unconfirmed broadcast means the
 * transfer may well have landed — reverting there would credit the user's
 * balance while the SOL is also in their wallet. The signature is carried so
 * the payout can be settled by inspection instead of by guessing.
 */
export class TreasuryUnconfirmedError extends Error {
  constructor(
    readonly signature: string,
    readonly cause_: unknown,
  ) {
    super(
      `[treasury] payout ${signature} was broadcast but not confirmed: ` +
        (cause_ instanceof Error ? cause_.message : String(cause_)),
    );
    this.name = "TreasuryUnconfirmedError";
  }
}

/**
 * Transient RPC conditions worth retrying: provider overload, rate limits and
 * transport hiccups. Deterministic failures (bad signature, insufficient funds,
 * simulation errors) are NOT in this set — retrying those just burns time and
 * can mask a real problem.
 */
function isTransientRpcError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("429") ||
    msg.includes("service unavailable") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

/** Retries an operation across transient RPC errors with linear backoff. */
async function withRpcRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientRpcError(e) || i === attempts) throw e;
      last = e;
      console.warn({
        msg: "treasury_rpc_retry",
        step: label,
        attempt: i,
        err: e instanceof Error ? e.message : String(e),
      });
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  throw last;
}

/**
 * Polls signature status to finality instead of subscribing over a websocket.
 *
 * `confirmTransaction` opens a `signatureSubscribe` socket; when that socket
 * cannot be established (rate-limited or restricted networks) it throws even
 * though the transaction may be perfectly fine. Polling needs only HTTP, which
 * is the same channel that already carried the broadcast.
 */
async function pollForFinality(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const DEADLINE_MS = 90_000;
  const started = Date.now();

  while (Date.now() - started < DEADLINE_MS) {
    const { value } = await withRpcRetry("getSignatureStatus", () =>
      connection.getSignatureStatuses([signature]),
    );
    const status = value[0];

    if (status?.err) {
      // A definitive on-chain rejection: nothing moved, safe to treat as failed.
      throw new Error(`[treasury] payout failed on-chain: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "finalized") return;

    // Past the blockhash's validity window with no status, the transaction can
    // no longer be included — but only conclude that after re-checking, since a
    // status can appear between the two calls.
    if (!status) {
      const height = await withRpcRetry("getBlockHeight", () => connection.getBlockHeight());
      if (height > lastValidBlockHeight) {
        const recheck = await connection.getSignatureStatuses([signature]);
        if (!recheck.value[0]) {
          throw new Error("[treasury] payout expired before inclusion");
        }
      }
    }

    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error("[treasury] timed out waiting for payout finality");
}

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

  // Safe to retry: nothing is signed or broadcast yet, so a repeat attempt
  // cannot move lamports twice. This is the step that failed with a 503 from
  // the public devnet RPC.
  const { blockhash, lastValidBlockHeight } = await withRpcRetry("getLatestBlockhash", () =>
    connection.getLatestBlockhash("finalized"),
  );

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
  // Serialize ONCE and resend the identical bytes. The signature is derived
  // from the signed message, so a resend is the same transaction and the
  // cluster de-duplicates it. Re-building with a fresh blockhash would produce
  // a DIFFERENT signature and could pay the user twice.
  const raw = tx.serialize();
  const signature = await withRpcRetry("sendRawTransaction", () =>
    connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 5 }),
  );

  // From here the transaction is on the wire. Any failure to establish its fate
  // must NOT be reported as a plain failure, or the caller will refund a
  // transfer that may have succeeded.
  try {
    await pollForFinality(connection, signature, lastValidBlockHeight);
  } catch (e) {
    const definitive =
      e instanceof Error &&
      (e.message.includes("failed on-chain") || e.message.includes("expired before inclusion"));
    if (definitive) throw e;
    throw new TreasuryUnconfirmedError(signature, e);
  }

  const parsed = await withRpcRetry("getTransaction", () =>
    connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    }),
  );
  return { signature, slot: parsed?.slot ?? null };
}
