import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthControl } from "@/components/auth/auth-control";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:focus-ring" aria-label="SolRival home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/solrival-emblem.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/solrival-wordmark-white.png" alt="SolRival" className="h-[18px] w-auto" />
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            Marketplace
          </Link>
          <Link
            href="/leaderboard"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            Leaderboard
          </Link>
          <Link
            href="/duels/create"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            Create duel
          </Link>
          <AuthControl />
        </nav>
      </div>
    </header>
  );
}
