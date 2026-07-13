import "server-only";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { SolRivalEscrowClient } from "@solrival/sdk";
import { env } from "@/lib/env";

const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl(cluster);

export const solanaConnection = new Connection(rpcUrl, "confirmed");

// Validated in env.ts — throws at boot if unset, so a misconfigured deploy can
// never silently fall back to a placeholder program id.
export const escrowProgramId = new PublicKey(env.NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID);

export const escrowClient = new SolRivalEscrowClient(escrowProgramId);

/**
 * Legacy on-chain duel fee. Under the credits model duels charge NO fee (winner
 * takes the whole pot); this is retained only for ONCHAIN_ESCROW back-compat.
 */
export const platformFeeBps = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_BPS ?? "500");

// ─── Credits / custody ───────────────────────────────────────────────────────

/** Public address of the platform treasury users deposit SOL into.
 *  Validated in env.ts — no placeholder fallback, so funds can never be routed
 *  to a default address by a misconfigured deploy. */
export const treasuryWallet = new PublicKey(env.NEXT_PUBLIC_TREASURY_WALLET);

/** Fee taken off every deposit (basis points). The platform's only fee source. */
export const depositFeeBps = Number(process.env.NEXT_PUBLIC_DEPOSIT_FEE_BPS ?? "50"); // 0.5%

/** Referrer reward as bps of a referee's first credited deposit. */
export const referralRewardBps = Number(process.env.NEXT_PUBLIC_REFERRAL_REWARD_BPS ?? "500"); // 5%

/** Confirmations / commitment the deposit verifier requires before crediting. */
export const depositCommitment = "finalized" as const;
