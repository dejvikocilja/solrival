"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { NonceResponse, SessionUser, VerifyResponse } from "@solrival/shared";
import { resolveProvider } from "@/lib/solana/wallet-provider";

type Status = "loading" | "authenticated" | "unauthenticated" | "signing";

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
  return data as T;
}

/**
 * Drives the Sign-In With Solana flow against the wallet selected via the
 * wallet-adapter modal. Call `signIn()` after a wallet is connected.
 */
export function useAuth() {
  const { publicKey, wallet, signMessage, connected, disconnect } = useWallet();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  // hydrate current session on mount
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => {
        if (!active) return;
        setUser(d.user);
        setStatus(d.user ? "authenticated" : "unauthenticated");
      })
      .catch(() => active && setStatus("unauthenticated"));
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    if (!publicKey || !signMessage || !wallet) {
      setError("Connect a wallet first");
      return;
    }
    const provider = resolveProvider(wallet.adapter.name);
    if (!provider) {
      setError("Unsupported wallet");
      return;
    }

    try {
      setStatus("signing");
      const walletAddress = publicKey.toBase58();

      // 1. request the server-issued challenge
      const { nonce, message } = await postJson<NonceResponse>("/api/auth/nonce", {
        walletAddress,
        provider,
      });

      // 2. sign the exact message
      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(signatureBytes);

      // 3. verify -> session cookie set by server
      const { user: authedUser } = await postJson<VerifyResponse>("/api/auth/verify", {
        walletAddress,
        provider,
        nonce,
        signature,
      });

      setUser(authedUser);
      setStatus("authenticated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setStatus("unauthenticated");
    }
  }, [publicKey, signMessage, wallet]);

  const signOut = useCallback(async () => {
    await postJson("/api/auth/logout").catch(() => {});
    await disconnect().catch(() => {});
    setUser(null);
    setStatus("unauthenticated");
  }, [disconnect]);

  return { user, status, error, connected, signIn, signOut };
}
