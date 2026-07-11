"use client";

/**
 * Settings → Game accounts. One panel per supported game: link a Supercell
 * player tag (validated against the live game API — typos are rejected with
 * the game's own answer) plus the in-game friend invite link (shown to a
 * matched opponent so they can add you and play). Both are required before
 * creating or accepting a duel in that game.
 */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Gamepad2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, TextInput, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getGameAccounts, linkGameAccount, type GameAccountView } from "@/lib/api/game-accounts";
import { ApiError } from "@/lib/api/client";
import type { Game } from "@solrival/shared";

const GAME_META: Record<Game, { label: string; tagHint: string; linkHint: string }> = {
  CLASH_ROYALE: {
    label: "Clash Royale",
    tagHint: "In Clash Royale: tap your name (top-left) — the tag is under it, like #2PYL9QGR",
    linkHint: "In Clash Royale: Social → Friends → Invite → Copy link (link.clashroyale.com/…)",
  },
  BRAWL_STARS: {
    label: "Brawl Stars",
    tagHint: "In Brawl Stars: tap your profile (top-left) — the tag is under your name",
    linkHint: "In Brawl Stars: Friends → Invite friends → Copy link (link.brawlstars.com/…)",
  },
};

export function GameAccountsCard() {
  const query = useQuery({ queryKey: ["game-accounts"], queryFn: getGameAccounts, staleTime: 30_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-heading-3 text-fg">Game accounts</h2>
        <p className="mt-1 text-body-sm text-muted">
          Link the accounts you compete with. Your player tag powers automatic match verification;
          your invite link is how a matched opponent adds you in-game. Both are required before
          dueling.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {query.isPending ? (
          <div className="h-40 w-full animate-pulse rounded-lg bg-surface-2" />
        ) : (
          (Object.keys(GAME_META) as Game[]).map((game) => (
            <GameAccountPanel
              key={game}
              game={game}
              linked={query.data?.accounts.find((a) => a.game === game) ?? null}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function GameAccountPanel({ game, linked }: { game: Game; linked: GameAccountView | null }) {
  const meta = GAME_META[game];
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState(linked === null);
  const [tag, setTag] = React.useState(linked?.inGameTag ?? "");
  const [link, setLink] = React.useState(linked?.friendLink ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedName, setSavedName] = React.useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { account } = await linkGameAccount({ game, playerTag: tag, friendLink: link });
      setSavedName(account.inGameName);
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["game-accounts"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't link the account. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-rival" aria-hidden />
          <h3 className="text-body-sm font-medium text-fg">{meta.label}</h3>
        </div>
        {linked && !editing ? (
          <span className="inline-flex items-center gap-1.5 text-caption text-victory">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Linked{savedName ? ` as ${savedName}` : ""} · {linked.inGameTag}
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 space-y-4">
          <Field label="Player tag" hint={meta.tagHint}>
            <TextInput
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="#2PYL9QGR"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
            />
          </Field>
          <Field label="Friend invite link" hint={meta.linkHint}>
            <TextInput
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={`https://link.${game === "CLASH_ROYALE" ? "clashroyale" : "brawlstars"}.com/...`}
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !tag.trim() || !link.trim()}>
              {saving ? "Checking with the game…" : linked ? "Update account" : "Link account"}
            </Button>
            {linked ? (
              <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-caption text-faint">{linked?.friendLink}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}
