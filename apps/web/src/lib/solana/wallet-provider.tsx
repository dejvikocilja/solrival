"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Registers the supported wallets. They are interchangeable to our auth
 * backend — each signs the SIWS message with ed25519. Imported from their
 * dedicated adapter packages (not the `@solana/wallet-adapter-wallets` barrel)
 * so the client bundle stays free of the WalletConnect / Reown / react-native
 * dependency tree the barrel pulls in. Wrap the app root with this provider.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";
    // Use a truthiness check, not `??`: an empty-string env var is not
    // null/undefined, so `??` would pass "" through as the endpoint and
    // silently break the connection.
    return rpc ? rpc : clusterApiUrl(cluster);
  }, []);

  /**
   * web3.js derives the websocket URL from the HTTP endpoint when none is
   * given, and that derivation drops the query string — which silently strips
   * the `?api-key=` most providers authenticate with, producing an opaque
   * "ws error: undefined". Deriving it here preserves the full URL, and
   * NEXT_PUBLIC_SOLANA_WS_URL overrides it for providers that serve
   * websockets from a different host.
   */
  const wsEndpoint = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_SOLANA_WS_URL?.trim();
    if (explicit) return explicit;
    try {
      const url = new URL(endpoint);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    } catch {
      return undefined; // fall back to web3.js's own derivation
    }
  }, [endpoint]);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed", wsEndpoint }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/** Maps a wallet-adapter name to our WalletProvider enum. */
export function resolveProvider(adapterName: string): "PHANTOM" | "SOLFLARE" | null {
  const n = adapterName.toLowerCase();
  if (n.includes("phantom")) return "PHANTOM";
  if (n.includes("solflare")) return "SOLFLARE";
  return null;
}
