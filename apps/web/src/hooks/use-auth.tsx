"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import type { NonceResponse, SessionUser, VerifyResponse } from "@solrival/shared";
import { resolveProvider } from "@/lib/solana/wallet-provider";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "signing";

export interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  error: string | null;
  connected: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

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
 * wallet-adapter modal. The state is shared app-wide through {@link AuthProvider}
 * so the header, forms, and pages all observe the same session at once.
 */
function useAuthState(): AuthContextValue {
  const { publicKey, wallet, signMessage, connected, disconnect } = useWallet();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
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
      // The balance / activity become readable the moment we're authed.
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setStatus("unauthenticated");
    }
  }, [publicKey, signMessage, wallet, queryClient]);

  const signOut = useCallback(async () => {
    await postJson("/api/auth/logout").catch(() => {});
    await disconnect().catch(() => {});
    setUser(null);
    setStatus("unauthenticated");
    setError(null);
    // Drop any credit-scoped data so a different player can't see it.
    queryClient.removeQueries({ queryKey: ["credits"] });
  }, [disconnect, queryClient]);

  return { user, status, error, connected, signIn, signOut };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the shared auth session. Must be used inside {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
