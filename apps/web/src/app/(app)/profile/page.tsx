import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Swords, Wallet as WalletIcon } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your SolRival profile, record, and account details.",
};

export const dynamic = "force-dynamic";

function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <div className="mb-7 flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-rival">Your account</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Profile</h1>
        <p className="max-w-xl text-sm text-muted">
          Your identity, competitive record, and account details on SolRival.
        </p>
      </div>

      {!user ? (
        <div className="rounded-xl border border-border bg-surface-2/40 px-6 py-16 text-center">
          <h2 className="font-display text-lg font-semibold text-fg">Sign in to view your profile</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Connect your wallet and sign in (top right) to see your record and account details.
          </p>
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}
          >
            Browse open duels
          </Link>
        </div>
      ) : (
        <ProfileBody
          username={user.username}
          walletAddress={user.walletAddress}
          wins={user.wins}
          losses={user.losses}
          createdAt={user.createdAt}
        />
      )}
    </main>
  );
}

function ProfileBody({
  username,
  walletAddress,
  wins,
  losses,
  createdAt,
}: {
  username: string;
  walletAddress: string;
  wins: number;
  losses: number;
  createdAt: Date;
}) {
  const played = wins + losses;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : null;
  const memberSince = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(createdAt));

  return (
    <div className="space-y-5">
      {/* identity */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-rival/15 text-lg font-semibold uppercase text-rival ring-1 ring-rival/30"
              aria-hidden
            >
              {username.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-lg font-semibold text-fg">
                {username}
                <BadgeCheck className="h-4 w-4 shrink-0 text-victory" aria-label="Verified" />
              </p>
              <p className="mt-0.5 font-mono text-xs text-faint tabular" title={walletAddress}>
                {shortWallet(walletAddress)}
              </p>
              <p className="mt-0.5 text-xs text-muted">Member since {memberSince}</p>
            </div>
          </div>
          <Link
            href="/duels"
            className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full sm:w-auto")}
          >
            <Swords className="h-4 w-4" aria-hidden />
            My duels
          </Link>
        </CardContent>
      </Card>

      {/* record */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Wins" value={wins} accent="text-victory" />
        <StatTile label="Losses" value={losses} accent="text-danger" />
        <StatTile label="Duels played" value={played} />
        <StatTile label="Win rate" value={winRate === null ? "—" : `${winRate}%`} />
      </div>

      {/* quick links */}
      <Card>
        <CardContent className="p-2.5">
          <Link
            href="/wallet"
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-surface-2 focus-visible:focus-ring"
          >
            <span className="flex items-center gap-2.5 text-fg">
              <WalletIcon className="h-4 w-4 text-muted" aria-hidden />
              Wallet &amp; balance
            </span>
            <ArrowRight className="h-4 w-4 text-faint" aria-hidden />
          </Link>
          <Link
            href="/marketplace"
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-surface-2 focus-visible:focus-ring"
          >
            <span className="flex items-center gap-2.5 text-fg">
              <Swords className="h-4 w-4 text-muted" aria-hidden />
              Find a duel
            </span>
            <ArrowRight className="h-4 w-4 text-faint" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = "text-fg",
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular", accent)}>{value}</p>
      </CardContent>
    </Card>
  );
}
