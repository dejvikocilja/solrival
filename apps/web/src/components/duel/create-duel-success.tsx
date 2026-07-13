"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Globe, Lock, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SolAmount } from "@/components/arena/sol-amount";
import { GAME_META } from "@/components/arena/game-meta";
import { RULE_META } from "@/components/duel/rule-meta";
import type { RuleTemplate } from "@solrival/shared";
import type { DuelSummary } from "@/lib/api/duels";

function shareUrl(duel: DuelSummary): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = `${origin}/duels/${duel.id}`;
  return duel.visibility === "PRIVATE" && duel.inviteToken
    ? `${base}?invite=${duel.inviteToken}`
    : base;
}

export function CreateDuelSuccess({
  duel,
  ruleTemplate,
  onCreateAnother,
}: {
  duel: DuelSummary;
  ruleTemplate: RuleTemplate;
  onCreateAnother: () => void;
}) {
  const game = GAME_META[duel.game];
  const url = React.useMemo(() => shareUrl(duel), [duel]);
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.");
    }
  }, [url]);

  const isPrivate = duel.visibility === "PRIVATE";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-victory/5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-victory/15 text-victory">
          <PartyPopper className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-[15px] font-semibold text-fg">Duel is live</p>
          <p className="text-sm text-muted">
            Your stake is locked and waiting for a rival.
          </p>
        </div>
      </div>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={game.badgeTone}>{game.label}</Badge>
          <Badge tone="neutral">{RULE_META[ruleTemplate]?.label ?? "Custom rule"}</Badge>
          <Badge tone={isPrivate ? "ember" : "rival"}>
            {isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            {isPrivate ? "Private" : "Public"}
          </Badge>
          <span className="ml-auto text-sm text-muted">
            Stake <SolAmount lamports={duel.stakeLamports} className="ml-1 text-fg" />
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">
            {isPrivate ? "Private invite link" : "Share link"}
          </p>
          <div className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-surface-2 px-3">
              <span className="truncate font-mono text-[13px] text-muted">{url}</span>
            </div>
            <Button type="button" variant="secondary" onClick={copy} aria-label="Copy link">
              {copied ? <Check className="h-4 w-4 text-victory" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-faint">
            {isPrivate
              ? "Only people with this link can accept the duel."
              : "Anyone can find this duel in the arena, or accept it directly via this link."}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Link
            href={`/duels/${duel.id}`}
            className="flex-1"
          >
            <Button type="button" className="w-full">
              View duel
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Button type="button" variant="secondary" className="flex-1" onClick={onCreateAnother}>
            Create another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
