"use client";

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

/**
 * Gate a primary action behind wallet connection + SIWS sign-in — as a single
 * continuation instead of a click staircase.
 *
 * The old pattern made the user click the CTA up to three times ("Connect
 * wallet" → click again → "Sign in" → click again → actual action), dropped
 * their intent at each step, surfaced no error when the signature was
 * declined, and allowed a second sign-in to fire mid-signature. This hook
 * fixes all four:
 *
 *  - `run(action)` remembers the intent: connecting resumes into sign-in,
 *    authenticating resumes into the action. One click end-to-end.
 *  - Closing the wallet modal without connecting cancels the intent, so a
 *    later unrelated connect can never fire a stale action.
 *  - A declined/failed signature cancels the intent and surfaces the error
 *    as a toast.
 *  - `busy` is true while the adapter is connecting or the SIWS flow is
 *    signing, so the CTA can disable and never double-fires.
 */
export function useAuthGate() {
  const { connected, connecting } = useWallet();
  const { visible, setVisible } = useWalletModal();
  const { status, signIn, error } = useAuth();

  // The deferred action, armed by run() while the user is un-gated.
  const pendingRef = React.useRef<(() => unknown) | null>(null);
  // Distinguishes a sign-in the gate initiated (whose failure we must surface
  // and whose success we must resume) from sign-ins started elsewhere.
  const gateSignInRef = React.useRef(false);

  const signing = status === "signing";
  const authenticated = status === "authenticated";
  const busy = connecting || signing;

  const cancel = React.useCallback(() => {
    pendingRef.current = null;
    gateSignInRef.current = false;
  }, []);

  /** Runs `action` now if fully authed; otherwise walks the gate and resumes. */
  const run = React.useCallback(
    (action: () => unknown) => {
      if (authenticated) {
        void action();
        return;
      }
      pendingRef.current = action;
      if (!connected) {
        setVisible(true); // resume via the connected-effect below
        return;
      }
      gateSignInRef.current = true;
      void signIn(); // resume via the authenticated-effect below
    },
    [authenticated, connected, setVisible, signIn],
  );

  // Wallet modal dismissed without a connection → the user backed out; a later
  // connect from elsewhere (e.g. the header) must not fire a stale action.
  const prevVisible = React.useRef(visible);
  React.useEffect(() => {
    if (prevVisible.current && !visible && !connected && !connecting) cancel();
    prevVisible.current = visible;
  }, [visible, connected, connecting, cancel]);

  // Connected with an armed intent → continue into sign-in (once).
  React.useEffect(() => {
    if (connected && pendingRef.current && !authenticated && !signing && !gateSignInRef.current) {
      gateSignInRef.current = true;
      void signIn();
    }
  }, [connected, authenticated, signing, signIn]);

  // Authenticated with an armed intent → run it exactly once.
  React.useEffect(() => {
    if (authenticated && pendingRef.current) {
      const action = pendingRef.current;
      cancel();
      void action();
    }
  }, [authenticated, cancel]);

  // A gate-initiated sign-in failed (declined signature, network) → tell the
  // user instead of a silently dead button, and disarm.
  React.useEffect(() => {
    if (gateSignInRef.current && status === "unauthenticated" && error) {
      toast.error(error === "Sign-in failed" ? "Sign-in failed. Please try again." : error);
      cancel();
    }
  }, [status, error, cancel]);

  /** CTA label for the current gate stage. */
  const label = React.useCallback(
    (base: string): string => {
      if (connecting) return "Connecting wallet…";
      if (signing) return "Waiting for wallet…";
      if (!connected) return "Connect wallet to continue";
      if (!authenticated) return "Sign in to continue";
      return base;
    },
    [connecting, signing, connected, authenticated],
  );

  return { run, busy, label, connected, authenticated };
}
