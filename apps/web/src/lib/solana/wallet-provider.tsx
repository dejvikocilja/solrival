"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Registers the three supported wallets. They are interchangeable to our auth
 * backend — each signs the SIWS message with ed25519. Wrap the app root with
 * this provider (e.g. in the (app) layout).
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";
    return rpc ?? clusterApiUrl(cluster);
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/** Maps a wallet-adapter name to our WalletProvider enum. */
export function resolveProvider(adapterName: string): "PHANTOM" | "SOLFLARE" | "BACKPACK" | null {
  const n = adapterName.toLowerCase();
  if (n.includes("phantom")) return "PHANTOM";
  if (n.includes("solflare")) return "SOLFLARE";
  if (n.includes("backpack")) return "BACKPACK";
  return null;
}
