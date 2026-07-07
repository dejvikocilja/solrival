"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { disputeDuel } from "@/lib/api/duels";
import { ApiError } from "@/lib/api/client";

const MIN_REASON = 10;
const MAX_REASON = 500;

export function DisputeDuelModal({
  duelId,
  settled = false,
  onClose,
}: {
  duelId: string;
  /** True when the duel already settled — the dispute contests the RESULT, not a live match. */
  settled?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const titleId = React.useId();

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  const mutation = useMutation({
    mutationFn: () => disputeDuel(duelId, trimmed),
    onSuccess: () => {
      toast.success("Dispute raised", {
        description: settled
          ? "The result is under review — related payouts are frozen until our team resolves it."
          : "Settlement is frozen while our team reviews the match.",
      });
      void queryClient.invalidateQueries({ queryKey: ["duel", duelId] });
      onClose();
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError && err.status === 409
          ? err.message
          : "Couldn't raise the dispute. Please try again.";
      toast.error(msg);
    },
  });

  // Escape closes (unless mid-submit)
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !mutation.isPending) onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [mutation.isPending, onClose]);

  function submit() {
    setTouched(true);
    if (tooShort || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-border bg-bg-raised shadow-card-hover"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-heading-3 text-fg">
            <Flag className="h-4 w-4 text-ember" aria-hidden />
            {settled ? "Contest this result" : "Report a problem"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={mutation.isPending}
            onClick={onClose}
            className="rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:focus-ring disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-body-sm text-muted">
            {settled
              ? "Contesting the result sends this duel to our team for review. If the verified outcome is wrong, we'll correct it — the payout is reversed and awarded to the rightful winner, or both stakes are returned. Withdrawals for both players are paused while the review is open."
              : "Raising a dispute freezes this duel — no one is paid until our team reviews the match and resolves it as a win or a full refund. Only use this if something genuinely went wrong (wrong result, opponent no-show, technical failure)."}
          </p>

          <div className="space-y-1.5">
            <label htmlFor="dispute-reason" className="text-body-sm font-medium text-fg">
              What happened?
            </label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
              onBlur={() => setTouched(true)}
              rows={4}
              placeholder={
                settled
                  ? "Explain why the result is wrong — include the match time and what actually happened."
                  : "Describe the problem — include the match time and what you expected to happen."
              }
              className="w-full resize-none rounded-md border border-border-strong bg-surface px-3 py-2.5 text-body text-fg placeholder:text-faint outline-none transition-colors focus:border-rival/40 focus:ring-1 focus:ring-rival/40"
            />
            <div className="flex items-center justify-between">
              {touched && tooShort ? (
                <FieldError>At least {MIN_REASON} characters — a short sentence is enough.</FieldError>
              ) : (
                <span />
              )}
              <span className="text-caption tabular text-faint">
                {trimmed.length}/{MAX_REASON}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={mutation.isPending || (touched && tooShort)}
            onClick={submit}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Raise dispute
          </Button>
        </div>
      </div>
    </div>
  );
}
