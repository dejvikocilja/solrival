import Link from "next/link";
import { Swords } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AuthControl } from "@/components/auth/auth-control";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 focus-visible:focus-ring rounded-md">
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
          <Link
            href="/duels"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            My duels
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
