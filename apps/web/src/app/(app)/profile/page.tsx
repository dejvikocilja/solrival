import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Swords, Wallet as WalletIcon } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getMyDuels } from "@/server/services/duel/my-duels";
import { PageContainer, Section } from "@/components/ui/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your SolRival profile, competitive record, and account details.",
};

export const dynamic = "force-dynamic";

const GAME_LABEL = { CLASH_ROYALE: "Clash Royale", BRAWL_STARS: "Brawl Stars" } as const;
const GAME_TONE: Record<keyof typeof GAME_LABEL, BadgeProps["tone"]> = {
  CLASH_ROYALE: "cr",
  BRAWL_STARS: "bs",
};

function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <PageContainer>
        <div className="mt-4 rounded-xl border border-border bg-surface-2/40 px-6 py-16 text-center">
          <h1 className="font-display text-heading-2 text-fg">Sign in to view your profile</h1>
          <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">
            Connect your wallet and sign in (top right) to see your record and account details.
          </p>
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}
          >
            Browse open duels
          </Link>
        </div>
      </PageContainer>
    );
  }

  const { duels } = await getMyDuels(user.id);
  const completed = duels.filter((d) => d.status === "COMPLETED" && d.youWon !== null);
  const recentForm = completed.slice(0, 10).map((d) => d.youWon as boolean); // newest first

  const perGame = (Object.keys(GAME_LABEL) as (keyof typeof GAME_LABEL)[]).map((game) => {
    const played = completed.filter((d) => d.game === game);
    const w = played.filter((d) => d.youWon).length;
    const l = played.length - w;
    return { game, w, l, played: played.length, rate: played.length ? Math.round((w / played.length) * 100) : null };
  });

  const wins = user.wins;
  const losses = user.losses;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : null;
  const joined = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(user.createdAt),
  );

  return (
    <PageContainer>
      {/* identity band */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 bg-gradient-to-br from-rival/[0.08] to-cr/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-gradient-to-br from-rival to-cr p-[2px]" aria-hidden>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 font-display text-xl font-bold uppercase text-fg">
                {user.username.slice(0, 2)}
              </span>
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-heading-2 text-fg">{user.username}</h1>
              <p className="mt-0.5 font-mono text-caption text-faint tabular">
                {shortWallet(user.walletAddress)} · joined {joined}
              </p>
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wins" value={wins} accent="text-victory" />
        <Stat label="Losses" value={losses} accent="text-danger" />
        <Stat label="Duels" value={total} />
        <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} />
      </div>

      {/* recent form */}
      <div className="mt-5">
        <Section title="Recent form">
          {recentForm.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {recentForm.map((won, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md font-display text-xs font-bold tabular",
                    won ? "bg-victory/15 text-victory" : "bg-danger/15 text-danger",
                  )}
                  title={won ? "Win" : "Loss"}
                >
                  {won ? "W" : "L"}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-body-sm text-muted">No completed duels yet — your last ten results will show here.</p>
          )}
        </Section>
      </div>

      {/* by game */}
      <div className="mt-5">
        <Section title="By game">
          <div className="grid gap-3 sm:grid-cols-2">
            {perGame.map((g) => (
              <Card key={g.game}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge tone={GAME_TONE[g.game]}>{GAME_LABEL[g.game]}</Badge>
                    <span className="font-mono text-caption text-faint tabular">{g.played} played</span>
                  </div>
                  <p className="mt-2.5 font-display text-heading-2 tabular text-fg">
                    {g.rate === null ? "—" : `${g.rate}%`}
                  </p>
                  <p className="text-caption text-muted tabular">
                    {g.w}W · {g.l}L
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </div>

      {/* account */}
      <div className="mt-5">
        <Section title="Account">
          <Card>
            <CardContent className="p-2">
              <AccountLink href="/duels" icon={Swords} label="My duels" />
              <AccountLink href="/wallet" icon={WalletIcon} label="Wallet & balance" />
            </CardContent>
          </Card>
        </Section>
      </div>
    </PageContainer>
  );
}

function AccountLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Swords;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-3 text-body transition-colors hover:bg-surface-2 focus-visible:focus-ring"
    >
      <Icon className="h-4 w-4 text-muted" aria-hidden />
      <span className="text-fg">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 text-faint" aria-hidden />
    </Link>
  );
}
