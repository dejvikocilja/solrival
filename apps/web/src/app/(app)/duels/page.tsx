import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getMyDuels } from "@/server/services/duel/my-duels";
import { MyDuelsList } from "@/components/duel/my-duels-list";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
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
    <PageContainer>
      <PageHeader
        eyebrow="Your matches"
        title="My duels"
        description="Every duel you've created or accepted — what's live, what's waiting, and how you've done."
        actions={
          <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
            Create duel
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {!user || !data ? (
        <div className="rounded-xl border border-border bg-surface-2/40 px-6 py-16 text-center">
          <h2 className="font-display text-heading-3 text-fg">Sign in to see your duels</h2>
          <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">
            Connect your wallet and sign in (top right) to track the duels you&rsquo;ve created and accepted.
          </p>
          <Link href="/marketplace" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}>
            Browse open duels
          </Link>
        </div>
      ) : (
        <MyDuelsList duels={data.duels} currentUserId={user.id} />
      )}
    </PageContainer>
  );
}
