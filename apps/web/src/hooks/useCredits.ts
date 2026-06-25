"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { apiPost } from "@/lib/api/client";

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
export const DEPOSIT_FEE_BPS = Number(process.env.NEXT_PUBLIC_DEPOSIT_FEE_BPS ?? "200");
// Upper bound for a single-transfer fee (5000 lamports/signature) + headroom.
const FEE_BUFFER_LAMPORTS = 10_000n;

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

      // Wait for FINALIZED before telling the server: the deposit verifier reads
      // the chain at `finalized`, so confirming only at `confirmed` would fail
      // server-side while the SOL has already left the wallet.
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "finalized",
      );

      return apiPost<{ deposit: { id: string; creditedLamports: string } }>(
        "/api/deposits",
        { signature },
      );
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
