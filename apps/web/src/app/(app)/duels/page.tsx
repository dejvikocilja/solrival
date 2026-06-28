import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getMyDuels } from "@/server/services/duel/my-duels";
import { MyDuelsList } from "@/components/duel/my-duels-list";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My duels",
  description: "Track your active, open, and completed duels.",
};

export const dynamic = "force-dynamic";

export default async function MyDuelsPage() {
  const user = await getCurrentUser();
  const data = user ? await getMyDuels(user.id) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-rival">Your matches</span>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">My duels</h1>
          <p className="max-w-xl text-sm text-muted">
            Every duel you&rsquo;ve created or accepted — what&rsquo;s live, what&rsquo;s waiting, and how you&rsquo;ve done.
          </p>
        </div>
        <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
          Create duel
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {!user || !data ? (
        <div className="rounded-xl border border-border bg-surface-2/40 px-6 py-16 text-center">
          <h2 className="font-display text-lg font-semibold text-fg">Sign in to see your duels</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Connect your wallet and sign in (top right) to track the duels you&rsquo;ve created and accepted.
          </p>
          <Link href="/marketplace" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}>
            Browse open duels
          </Link>
        </div>
      ) : (
        <MyDuelsList duels={data.duels} currentUserId={user.id} />
      )}
    </main>
  );
}