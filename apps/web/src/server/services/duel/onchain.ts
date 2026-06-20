import "server-only";
import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { decodeEscrow, type EscrowAccount } from "@solrival/sdk";
import { solanaConnection } from "../../solana/config";

/**
 * Legacy on-chain escrow helpers.
 *
 * The live money flow is the custodial credits ledger (see credit-duel.ts);
 * these back the optional on-chain escrow duel path. Every confirmation
 * re-reads state from the RPC — the client is never trusted about what
 * happened on-chain.
 */

/** Build an unsigned, base64-serialized tx for the wallet to sign and submit. */
export async function buildUnsignedTx(
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await solanaConnection.getLatestBlockhash("finalized");
  const tx = new Transaction();
  tx.feePayer = feePayer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(...instructions);
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

/** True only if the transaction is finalized on-chain with no error. */
export async function confirmTxSucceeded(signature: string): Promise<boolean> {
  const result = await solanaConnection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  return result?.meta?.err === null;
}

/** Fetch + decode the escrow account, or null if it no longer exists. */
export async function fetchEscrow(pda: PublicKey): Promise<EscrowAccount | null> {
  const account = await solanaConnection.getAccountInfo(pda, "finalized");
  if (account === null) return null;
  return decodeEscrow(account.data);
}

/** An escrow is "closed" once its on-chain account no longer exists. */
export async function escrowIsClosed(pda: PublicKey): Promise<boolean> {
  const account = await solanaConnection.getAccountInfo(pda, "finalized");
  return account === null;
}