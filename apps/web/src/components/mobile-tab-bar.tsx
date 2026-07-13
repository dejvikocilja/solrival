"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Swords, Plus, Trophy, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mobile navigation spine. On phones the header nav links are hidden
 * (`hidden sm:inline-flex`), so this fixed bottom bar is the only way to reach
 * the core loop. Desktop keeps the top header and never renders this
 * (`sm:hidden`).
 *
 * Five slots, matching the locked IA: Play (arena) · My duels · Create
 * (center, raised, the one primary action) · Leaderboard · Wallet. Pages already
 * reserve space for it via PageContainer's `pb-24`.
 *
 * Auth-gated destinations (My duels, Create, Wallet) stay visible when signed
 * out and surface their own sign-in prompts on arrival — one consistent nav
 * beats a bar that changes shape with session state.
 */

interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** True when this destination should read as "active" for the current path. */
  match: (pathname: string) => boolean;
}

const TABS: TabItem[] = [
  {
    href: "/arena",
    label: "Play",
    icon: Gamepad2,
    match: (p) => p === "/arena" || p.startsWith("/arena/"),
  },
  {
    href: "/duels",
    label: "My duels",
    icon: Swords,
    // Exclude the create route — it's the center action, not this tab.
    match: (p) => p === "/duels" || (p.startsWith("/duels/") && p !== "/duels/create"),
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: Trophy,
    match: (p) => p.startsWith("/leaderboard"),
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: Wallet,
    match: (p) => p.startsWith("/wallet"),
  },
];

const CREATE_HREF = "/duels/create";

// Surfaces that own their chrome (admin shell) or must stay unreachable
// (styleguide) never show the player tab bar.
const HIDDEN_PREFIXES = ["/admin", "/design"];

export function MobileTabBar() {
  const pathname = usePathname() ?? "/";

  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  const createActive = pathname === CREATE_HREF;

  // Split the four standard tabs around the raised center action: 2 · [+] · 2.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1">
        {left.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}

        <div className="flex items-center justify-center">
          <Link
            href={CREATE_HREF}
            aria-label="Create duel"
            aria-current={createActive ? "page" : undefined}
            className={cn(
              "flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-rival text-rival-fg",
              "shadow-[0_8px_24px_-6px_hsl(var(--rival)/0.9)] transition-transform active:scale-95 focus-visible:focus-ring",
              createActive && "ring-2 ring-ring/70 ring-offset-2 ring-offset-bg",
            )}
          >
            <Plus className="h-6 w-6" aria-hidden strokeWidth={2.5} />
          </Link>
        </div>

        {right.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: TabItem; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-0.5 rounded-md text-caption transition-colors focus-visible:focus-ring",
        active ? "text-rival" : "text-faint hover:text-muted",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden strokeWidth={active ? 2.25 : 2} />
      <span className="text-[11px] font-medium leading-none">{tab.label}</span>
    </Link>
  );
}
