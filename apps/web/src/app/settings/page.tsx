"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, TextInput, FieldError } from "@/components/ui/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiPatch, ApiError } from "@/lib/api/client";
import type { SessionUser } from "@solrival/shared";
import { cn } from "@/lib/utils";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export default function SettingsPage() {
  const { user, status, refresh } = useAuth();

  return (
    <PageContainer>
      <PageHeader eyebrow="Your account" title="Settings" description="Manage how you appear on SolRival." />

      {status === "loading" ? (
        <div className="h-48 w-full animate-pulse rounded-xl bg-surface-2" />
      ) : !user ? (
        <div className="rounded-xl border border-border bg-surface-2/40 px-6 py-16 text-center">
          <h2 className="font-display text-heading-3 text-fg">Sign in to manage your account</h2>
          <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">
            Connect your wallet and sign in (top right) to edit your settings.
          </p>
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}
          >
            Browse open duels
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <UsernameCard user={user} onSaved={refresh} />
          <WalletCard address={user.walletAddress} />
        </div>
      )}
    </PageContainer>
  );
}

function UsernameCard({ user, onSaved }: { user: SessionUser; onSaved: () => Promise<void> }) {
  const [value, setValue] = React.useState(user.username);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const trimmed = value.trim();
  const formatValid = USERNAME_RE.test(trimmed);
  const changed = trimmed !== user.username;
  const showFormatError = trimmed.length > 0 && !formatValid;
  const canSave = formatValid && changed && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiPatch<{ user: SessionUser }>("/api/users/me", { username: trimmed });
      await onSaved(); // refresh session so the header + everywhere updates
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const errorText = error ?? (showFormatError ? "3–20 characters · letters, numbers, hyphen or underscore" : undefined);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-heading-3 text-fg">Username</h2>
        <p className="mt-1 text-body-sm text-muted">This is the name rivals see on the marketplace and leaderboard.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Username" hint={`${trimmed.length}/20`}>
          <TextInput
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
              setSaved(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            aria-invalid={errorText ? true : undefined}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            placeholder="your_handle"
          />
          <FieldError>{errorText}</FieldError>
        </Field>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!canSave} loading={saving}>
            Save changes
          </Button>
          {saved && !changed ? (
            <span className="inline-flex items-center gap-1.5 text-body-sm text-victory">
              <Check className="h-4 w-4" aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function WalletCard({ address }: { address: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-heading-3 text-fg">Wallet</h2>
        <p className="mt-1 text-body-sm text-muted">The Solana wallet linked to your account. This can&rsquo;t be changed.</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
          <span className="truncate font-mono text-body-sm text-fg">{address}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-caption text-muted transition-colors hover:bg-surface hover:text-fg focus-visible:focus-ring"
            aria-label="Copy wallet address"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-victory" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
