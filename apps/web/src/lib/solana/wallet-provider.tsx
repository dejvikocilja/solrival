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
export function resolveProvider(adapterName: string): "PHANTOM" | "SOLFLARE" | null {
  const n = adapterName.toLowerCase();
  if (n.includes("phantom")) return "PHANTOM";
  if (n.includes("solflare")) return "SOLFLARE";
  return null;
}
