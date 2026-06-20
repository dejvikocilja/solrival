import Link from "next/link";
import { Swords } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BalancePill } from "@/components/credits/balance-pill";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/marketplace" className="flex items-center gap-2 focus-visible:focus-ring rounded-md">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rival text-rival-fg">
            <Swords className="h-4 w-4" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
            Sol<span className="text-rival">Rival</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            Marketplace
          </Link>
          <BalancePill />
          <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            Create duel
          </Link>
        </nav>
      </div>
    </header>
  );
}
