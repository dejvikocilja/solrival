"use client";

import * as React from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthControl } from "@/components/auth/auth-control";
import { cn } from "@/lib/utils";

/**
 * Tracks whether the page has scrolled past a small threshold, rAF-throttled.
 * Drives the header's "merged with the page → distinct chrome" transition.
 */
function useScrolled(threshold = 12): boolean {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update(); // initial position (e.g. reload mid-page)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);

  return scrolled;
}

/**
 * At the top of a page the header is transparent — it reads as part of the
 * page itself (the home hero especially). Once you scroll, it eases into
 * distinct chrome: raised surface, hairline border, backdrop blur. The
 * transition is pure CSS (fast, and disabled automatically by the global
 * prefers-reduced-motion rule).
 */
export function SiteHeader() {
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-border bg-bg/80 shadow-[0_1px_0_0_hsl(var(--border)),0_8px_24px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
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
