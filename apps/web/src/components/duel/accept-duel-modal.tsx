"use client";

import * as React from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Swords, TriangleAlert, Wallet, X } from "lucide-react";
import { isValidFriendLink } from "@solrival/shared";
import { Button } from "@/components/ui/button";
import { Field, TextInput, FieldError } from "@/components/ui/field";
import { SolAmount } from "@/components/marketplace/sol-amount";
import { GAME_META } from "@/components/marketplace/game-meta";
import { FRIEND_LINK_HINT, FRIEND_LINK_HELP } from "@/components/duel/rule-meta";
import { useBalance } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/use-auth";
import { acceptDuel } from "@/lib/api/duels";
import { ApiError } from "@/lib/api/client";
import type { DuelDetail } from "@/lib/api/duels";
import { lamportsToSol } from "@/lib/utils";

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  React.useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])',
        ),
      );
    focusable()[0]?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [active, ref]);
}

function Row({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: "victory" | "danger";
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted">{label}</span>
      <span
        className={
          emphasis === "victory"
            ? "text-victory"
            : emphasis === "danger"
              ? "text-danger"
              : "text-fg"
        }
      >
        {children}
      </span>
    </div>
  );
}

export function AcceptDuelModal({
  duel,
  onClose,
  onAccepted,
}: {
  duel: DuelDetail;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { status: authStatus, signIn } = useAuth();
  const { data: balanceData } = useBalance();
  const queryClient = useQueryClient();

  const [friendLink, setFriendLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const stake = BigInt(duel.stakeLamports);
  const pot = stake * 2n;
  const fee = (pot * BigInt(duel.platformFeeBps)) / 10_000n;
  const reward = pot - fee;
  const available = balanceData ? BigInt(balanceData.balance.availableLamports) : null;
  const isAuthed = authStatus === "authenticated";
  const insufficient = isAuthed && available != null && available < stake;
  const game = GAME_META[duel.game];

  useFocusTrap(dialogRef, true);

  const accept = useMutation({
    mutationFn: () => acceptDuel(duel.id, friendLink.trim()),
    onSuccess: () => {
      toast.success("Challenge accepted — the duel is live. Add your rival in-game and play.");
      void queryClient.invalidateQueries({ queryKey: ["duel", duel.id] });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
      onAccepted();
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Couldn't accept the duel. Please try again.");
    },
  });

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !accept.isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accept.isPending, onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (accept.isPending) return;

    if (!connected) {
      setVisible(true);
      return;
    }
    if (!isAuthed) {
      await signIn();
      return;
    }
    const trimmed = friendLink.trim();
    if (!trimmed) {
      setLinkError("Paste your in-game friend link.");
      return;
    }
    if (!isValidFriendLink(duel.game, trimmed)) {
      setLinkError(`That doesn't look like a ${game.label} link (${FRIEND_LINK_HINT[duel.game]}).`);
      return;
    }
    if (insufficient) return;
    accept.mutate();
  }

  const submitLabel = !connected
    ? "Connect wallet"
    : !isAuthed
      ? "Sign in to accept"
      : insufficient
        ? "Insufficient balance"
        : "Accept challenge";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !accept.isPending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-t-2xl border border-border bg-bg-raised shadow-card-hover animate-fade-up sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rival/15 text-rival">
              <Swords className="h-4 w-4" aria-hidden />
            </span>
            <h2 id={titleId} className="font-display text-[15px] font-semibold text-fg">
              Accept challenge
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={accept.isPending}
            onClick={onClose}
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:focus-ring disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold uppercase text-fg ring-1 ring-border">
                {duel.creator.username.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-faint">Challenge from</p>
                <p className="truncate text-sm font-medium text-fg">{duel.creator.username}</p>
              </div>
              <span className="ml-auto rounded-md bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                {game.label}
              </span>
            </div>

            <div className="rounded-lg border border-border bg-surface-2/60 px-4 [&>*+*]:border-t [&>*+*]:border-border">
              <Row label="Stake">
                <SolAmount lamports={stake.toString()} className="text-sm" />
              </Row>
              <Row label="Prize pool" emphasis="victory">
                <SolAmount lamports={pot.toString()} className="text-sm font-semibold" />
              </Row>
              <Row label="Winner takes" emphasis="victory">
                <SolAmount lamports={reward.toString()} className="text-sm font-semibold" />
              </Row>
              {available != null ? (
                <Row label="Your balance" emphasis={insufficient ? "danger" : undefined}>
                  <SolAmount lamports={available.toString()} className="text-sm" />
                </Row>
              ) : null}
            </div>

            {insufficient ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-3"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                <p className="text-xs text-danger">
                  You need ◎{lamportsToSol(stake)} to accept this duel.{" "}
                  <Link href="/wallet" className="font-medium underline underline-offset-2">
                    Deposit more
                  </Link>{" "}
                  to play.
                </p>
              </div>
            ) : null}

            {isAuthed && !insufficient ? (
              <Field label="Friend link" hint={FRIEND_LINK_HINT[duel.game]}>
                <TextInput
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={accept.isPending}
                  value={friendLink}
                  onChange={(e) => {
                    setFriendLink(e.target.value);
                    if (linkError) setLinkError(null);
                  }}
                  aria-invalid={!!linkError}
                  placeholder={`https://${FRIEND_LINK_HINT[duel.game]}/...`}
                />
                {linkError ? (
                  <FieldError>{linkError}</FieldError>
                ) : (
                  <p className="text-xs text-faint">{FRIEND_LINK_HELP[duel.game]}</p>
                )}
              </Field>
            ) : (
              <p className="text-sm text-muted">
                {!connected
                  ? "Connect your wallet and sign in to accept this challenge."
                  : "Sign in to accept this challenge — your stake is locked from your SolRival balance."}
              </p>
            )}
          </div>

          <div className="flex gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" className="flex-1" disabled={accept.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={accept.isPending || insufficient}>
              {accept.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Accepting…
                </>
              ) : (
                <>
                  {!connected ? <Wallet className="h-4 w-4" /> : null}
                  {submitLabel}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
