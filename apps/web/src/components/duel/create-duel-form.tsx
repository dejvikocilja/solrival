"use client";

import { useGameAccount, GameAccountGate } from "@/components/game-account/game-account-gate";
import * as React from "react";
import { useAuthGate } from "@/hooks/use-auth-gate";
import { Globe, Loader2, Lock, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  MIN_STAKE_LAMPORTS,
  MAX_STAKE_LAMPORTS,
  RULES_BY_GAME,
  type DuelVisibility,
  type Game,
  type RuleTemplate,
} from "@solrival/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Field, TextInput, FieldError } from "@/components/ui/field";
import { SolAmount } from "@/components/marketplace/sol-amount";
import { GAME_META } from "@/components/marketplace/game-meta";
import { RULE_META, FRIEND_LINK_HELP } from "@/components/duel/rule-meta";
import { CreateDuelSuccess } from "@/components/duel/create-duel-success";
import { useCreateDuel, type CreateStatus } from "@/hooks/use-create-duel";
import { cn } from "@/lib/utils";

const GAME_OPTIONS = [
  { value: "CLASH_ROYALE", label: "Clash Royale", activeClassName: "text-cr" },
  { value: "BRAWL_STARS", label: "Brawl Stars", activeClassName: "text-bs" },
];
const STAKE_PRESETS = ["0.05", "0.1", "0.25", "0.5", "1"];
const LAMPORTS_PER_SOL = 1_000_000_000;
const DUEL_RAKE_BPS = Number(process.env.NEXT_PUBLIC_DUEL_RAKE_BPS ?? "1000");


type Errors = Partial<Record<"stake", string>>;

const BUSY: Record<CreateStatus, string | null> = {
  idle: null,
  creating: "Locking your stake…",
  done: null,
  error: null,
};

function stakeToLamports(sol: string): bigint | null {
  const n = Number.parseFloat(sol);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * LAMPORTS_PER_SOL));
}

export function CreateDuelForm() {
  const gate = useAuthGate();
  const flow = useCreateDuel();

  const [game, setGame] = React.useState<Game>("CLASH_ROYALE");
  // Duels require a linked game account for the selected game (tag = automatic
  // verification; invite link = how the opponent adds you in-game). Only
  // queried once signed in; the gate CTA handles the signed-out case.
  const gameAccount = useGameAccount(game, gate.authenticated);
  const [ruleTemplate, setRuleTemplate] = React.useState<RuleTemplate>(RULES_BY_GAME.CLASH_ROYALE[0]);
  const [visibility, setVisibility] = React.useState<DuelVisibility>("PUBLIC");
  const [stake, setStake] = React.useState("");
  const [errors, setErrors] = React.useState<Errors>({});

  const busyLabel = BUSY[flow.status];
  const isBusy = busyLabel !== null;

  // Surface flow errors as a toast once per transition.
  const lastError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (flow.status === "error" && flow.error && flow.error !== lastError.current) {
      lastError.current = flow.error;
      toast.error(flow.error);
    }
    if (flow.status !== "error") lastError.current = null;
  }, [flow.status, flow.error]);

  function onGameChange(next: string) {
    const g = next as Game;
    setGame(g);
    setRuleTemplate(RULES_BY_GAME[g][0]); // keep rule valid for the game
  }

  function validate(): Errors {
    const next: Errors = {};
    const lamports = stakeToLamports(stake);
    if (lamports === null) {
      next.stake = "Enter a stake amount.";
    } else if (lamports < MIN_STAKE_LAMPORTS) {
      next.stake = `Minimum stake is ${Number(MIN_STAKE_LAMPORTS) / LAMPORTS_PER_SOL} SOL.`;
    } else if (lamports > MAX_STAKE_LAMPORTS) {
      next.stake = `Maximum stake is ${Number(MAX_STAKE_LAMPORTS) / LAMPORTS_PER_SOL} SOL.`;
    }
    return next;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy || gate.busy) return;
    if (gate.authenticated && !gameAccount.linked) return; // gate notice explains why

    // Validate before gating so field errors show immediately — and so the
    // deferred submit can never fire with an invalid form after sign-in.
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const lamports = stakeToLamports(stake)!;
    gate.run(() =>
      flow.submit({
        game,
        ruleTemplate,
        visibility,
        stakeLamports: lamports.toString(),
      }),
    );
  }

  function createAnother() {
    flow.reset();
    setStake("");
    setErrors({});
  }

  if (flow.status === "done" && flow.duel) {
    return (
      <CreateDuelSuccess duel={flow.duel} ruleTemplate={ruleTemplate} onCreateAnother={createAnother} />
    );
  }

  const lamports = stakeToLamports(stake);
  const potLamports = lamports ? lamports * 2n : null;
  const rakePct = (DUEL_RAKE_BPS / 100).toString();
  const rewardLamports =
    potLamports !== null ? potLamports - (potLamports * BigInt(DUEL_RAKE_BPS)) / 10_000n : null;
  const rules = RULES_BY_GAME[game];

  const submitLabel = gate.label("Create duel");

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="space-y-6">
          {/* Game */}
          <Field label="Game">
            <Segmented
              aria-label="Select game"
              options={GAME_OPTIONS}
              value={game}
              onValueChange={onGameChange}
            />
          </Field>

          {/* Rule template */}
          <Field label="Duel rules" hint={`${rules.length} formats`}>
            <div className="grid gap-2 sm:grid-cols-2">
              {rules.map((rt) => {
                const active = rt === ruleTemplate;
                return (
                  <button
                    key={rt}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setRuleTemplate(rt)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:focus-ring",
                      active
                        ? "border-rival/60 bg-rival/10"
                        : "border-border bg-surface-2 hover:border-border-strong",
                    )}
                  >
                    <span className="block text-sm font-medium text-fg">{RULE_META[rt].label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                      {RULE_META[rt].summary}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Stake */}
          <Field label="Stake" hint="SOL">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                ◎
              </span>
              <TextInput
                inputMode="decimal"
                placeholder="0.00"
                value={stake}
                onChange={(e) => {
                  setStake(e.target.value);
                  if (errors.stake) setErrors((x) => ({ ...x, stake: undefined }));
                }}
                aria-invalid={!!errors.stake}
                className="pl-8 font-mono tabular"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STAKE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setStake(p);
                    setErrors((x) => ({ ...x, stake: undefined }));
                  }}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium tabular transition-colors",
                    stake === p
                      ? "border-rival/60 bg-rival/10 text-fg"
                      : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  ◎ {p}
                </button>
              ))}
            </div>
            <FieldError>{errors.stake}</FieldError>
          </Field>

          {/* Visibility */}
          <Field label="Visibility">
            <Segmented
              aria-label="Duel visibility"
              options={[
                { value: "PUBLIC", label: "Public" },
                { value: "PRIVATE", label: "Private" },
              ]}
              value={visibility}
              onValueChange={(v) => setVisibility(v as DuelVisibility)}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted">
              {visibility === "PUBLIC" ? (
                <>
                  <Globe className="h-3.5 w-3.5 text-faint" />
                  Listed in the marketplace — any player can accept.
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-faint" />
                  Hidden from the marketplace — only people with your invite link can accept.
                </>
              )}
            </p>
          </Field>

          {/* Linked game account gate — tag + invite link come from Settings */}
          {gameAccount.loading ? (
            <div className="h-16 w-full animate-pulse rounded-lg bg-surface-2" />
          ) : !gameAccount.linked ? (
            <GameAccountGate game={game} />
          ) : null}

          {/* Summary */}
          <div className="rounded-lg border border-border bg-surface-2/60 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Your stake</span>
              <span className="font-mono text-fg">
                {lamports ? <SolAmount lamports={lamports.toString()} /> : <span className="text-faint">—</span>}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Prize pool</span>
              <span className="font-mono text-fg">
                {potLamports !== null ? <SolAmount lamports={potLamports.toString()} /> : <span className="text-faint">—</span>}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">
                Winner takes <span className="text-faint">(after {rakePct}% rake)</span>
              </span>
              <span className="font-mono font-semibold text-victory">
                {rewardLamports !== null ? <SolAmount lamports={rewardLamports.toString()} /> : <span className="text-faint">—</span>}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Both players stake the same amount. The winner takes the pool minus a {rakePct}% platform
              rake, credited automatically. Open for 30 minutes — if no one accepts, your stake is
              refunded in full.
            </p>
          </div>

          {/* Progress / submit */}
          {isBusy ? (
            <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {busyLabel}
            </div>
          ) : (
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={gate.busy || (gate.authenticated && (gameAccount.loading || !gameAccount.linked))}
            >
              {gate.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : !gate.connected ? (
                <Wallet className="h-4 w-4" />
              ) : null}
              {submitLabel}
              {gate.authenticated && lamports ? (
                <SolAmount lamports={lamports.toString()} className="opacity-90" />
              ) : null}
            </Button>
          )}

          <p className="text-center text-xs text-faint">
            Your stake is locked instantly from your SolRival balance — no wallet signature needed.
          </p>
        </CardContent>
      </Card>
    </form>
  );
}
