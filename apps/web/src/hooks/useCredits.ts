"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { apiPost, ApiError } from "@/lib/api/client";

/**
 * Data hooks for the GGDUEL balance: read balance + ledger, make a deposit
 * (wallet transfer to treasury, then server-side confirm), and request a
 * withdrawal. All reads invalidate on a successful mutation so the UI stays live.
 */

export type BalanceView = {
  availableLamports: string;
  lockedLamports: string;
  totalLamports: string;
  lifetimeDepositedLamports: string;
  lifetimeWithdrawnLamports: string;
  lifetimeWonLamports: string;
};

export type LedgerEntryView = {
  id: string;
  type: string;
  deltaAvailable: string;
  deltaLocked: string;
  availableAfter: string;
  lockedAfter: string;
  duelId: string | null;
  depositId: string | null;
  withdrawalId: string | null;
  memo: string | null;
  createdAt: string;
};

export type WithdrawalView = {
  id: string;
  status: string;
  amountLamports: string;
  destinationWallet: string;
  autoApproved: boolean;
  heldReason: string | null;
  reviewNotes: string | null;
  txSignature: string | null;
  createdAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
};

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET ?? "";
export const DEPOSIT_FEE_BPS = Number(process.env.NEXT_PUBLIC_DEPOSIT_FEE_BPS ?? "50");
// Upper bound for a single-transfer fee (5000 lamports/signature) + headroom.
const FEE_BUFFER_LAMPORTS = 10_000n;

/** What the claim endpoint returns. `status` drives the UI: a DETECTED deposit
 *  is recorded and will credit itself, not an error the user must act on. */
export type DepositClaimView = {
  id: string;
  status: "DETECTED" | "CONFIRMED" | "CREDITED" | "REJECTED";
  txSignature: string;
  creditedLamports: string;
  error: string | null;
};

/**
 * Retries an idempotent call with a fixed backoff. Used only for the deposit
 * claim, where a transient network blip must not cost the user their transfer.
 */
async function withRetries<T>(fn: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      // A verdict the server has already reached is final — retrying can't
      // change it. Network failures (status 0) and 5xx are retried; so is a
      // rate limit, which is temporary by definition.
      const final =
        e instanceof ApiError && e.status >= 400 && e.status < 500 && e.code !== "RATE_LIMITED";
      if (final) throw e;
      lastError = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

/** Thrown when the user dismisses the wallet popup — a cancel, not a real error. */
export class DepositCancelledError extends Error {
  constructor() {
    super("Deposit cancelled");
    this.name = "DepositCancelledError";
  }
}

/** Phantom reports a dismissed popup as code 4001 / "User rejected the request". */
function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  const code = (e as { code?: number } | null)?.code;
  return code === 4001 || msg.includes("user rejected") || msg.includes("rejected the request");
}

const balanceKey = ["credits", "balance"] as const;
const withdrawalsKey = ["credits", "withdrawals"] as const;

export function useBalance() {
  return useQuery({
    queryKey: balanceKey,
    queryFn: () =>
      fetch("/api/balance", { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load balance");
        return r.json() as Promise<{ balance: BalanceView; ledger: { entries: LedgerEntryView[]; nextCursor: string | null } }>;
      }),
    refetchInterval: 20_000,
  });
}

export function useWithdrawals() {
  return useQuery({
    queryKey: withdrawalsKey,
    queryFn: () =>
      fetch("/api/withdrawals", { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load withdrawals");
        return r.json() as Promise<{ withdrawals: WithdrawalView[]; nextCursor: string | null }>;
      }),
  });
}

/**
 * Deposit: build + send a SOL transfer from the connected wallet to the
 * treasury, await confirmation, then post the signature so the server verifies
 * it on-chain and credits the balance (net of fee). One wallet popup, once.
 */
export function useDeposit() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const qc = useQueryClient();

  const run = useCallback(
    async (lamports: bigint) => {
      if (!publicKey) throw new Error("Connect your wallet first");
      if (!TREASURY) throw new Error("Treasury wallet is not configured");

      // Pre-flight on the app's cluster: gives a clear message instead of an
      // opaque wallet rejection if the wallet is on the wrong network or low.
      const balance = BigInt(await connection.getBalance(publicKey));
      if (balance < lamports + FEE_BUFFER_LAMPORTS) {
        throw new Error(
          "Insufficient SOL on the connected network. Make sure your wallet is on the same " +
            "network as the app (Devnet for testing) and funded enough to cover the deposit plus fees.",
        );
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY),
          lamports,
        }),
      );

      let signature: string;
      try {
        signature = await sendTransaction(tx, connection);
      } catch (e) {
        if (isUserRejection(e)) throw new DepositCancelledError();
        throw e;
      }

      // ── The SOL has now left the wallet. Everything below is recovery. ─────
      //
      // The signature is posted to the server IMMEDIATELY, before any attempt
      // to confirm it on-chain. The server persists it and credits it from the
      // sweep whatever happens next, so a dropped connection, a locked wallet,
      // or a closed tab can no longer strand a real transfer in the treasury.
      //
      // Deliberately NOT using connection.confirmTransaction: it subscribes
      // over a websocket, and a websocket that won't open (rate-limited public
      // RPC, restrictive network) threw before the claim was ever sent — the
      // exact failure that lost deposits. Server polling needs no socket.
      const claim = () =>
        apiPost<{ deposit: DepositClaimView }>("/api/deposits", { signature });

      // The claim itself is retried hard: losing it is the one outcome worth
      // avoiding at any cost, and it is idempotent.
      let result = await withRetries(claim, 4, 1_500);
      if (result.deposit.status === "CREDITED") return result;

      // Finalization takes ~15–30s. Poll the server, which re-verifies against
      // the chain on each call. Giving up here is not a failure: the row exists
      // and the sweep will credit it.
      const POLL_ATTEMPTS = 20;
      const POLL_INTERVAL_MS = 3_000;
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          result = await claim();
          if (result.deposit.status === "CREDITED") return result;
          if (result.deposit.status === "REJECTED") return result;
        } catch {
          // Transient — the deposit is already recorded; keep polling.
        }
      }
      return result;
    },
    [connection, publicKey, sendTransaction],
  );

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: balanceKey });
    },
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountLamports: bigint; destinationWallet?: string }) =>
      apiPost<{ withdrawal: WithdrawalView; autoApproved: boolean; message: string }>("/api/withdrawals", {
        amountLamports: input.amountLamports.toString(),
        destinationWallet: input.destinationWallet,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: balanceKey });
      void qc.invalidateQueries({ queryKey: withdrawalsKey });
    },
  });
}
