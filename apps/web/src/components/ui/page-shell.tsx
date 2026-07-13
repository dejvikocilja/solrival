import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives that encode SolRival's page rhythm in ONE place, so screens
 * stop hand-rolling their own container width, padding, and header markup.
 *
 *   <PageContainer>
 *     <PageHeader eyebrow="Your account" title="Profile" description="…" actions={…} />
 *     <Section title="Record">…</Section>
 *   </PageContainer>
 *
 * `pb-24` reserves room for the mobile bottom tab bar (added in Phase 2). These
 * are presentational and server-safe (no hooks), so they work in both server and
 * client components.
 */

const CONTAINER_WIDTHS = {
  content: "max-w-3xl", // focused pages: profile, wallet, a single duel, settings
  wide: "max-w-6xl", // dense pages: arena grid, leaderboard
  full: "max-w-7xl", // edge-to-edge shells
} as const;

type ContainerWidth = keyof typeof CONTAINER_WIDTHS;

export function PageContainer({
  size = "content",
  className,
  children,
}: {
  size?: ContainerWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 pb-24 pt-8 sm:px-6 sm:pt-10",
        CONTAINER_WIDTHS[size],
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <span className="text-overline uppercase text-rival">{eyebrow}</span> : null}
        <h1 className="font-display text-heading-1 text-fg">{title}</h1>
        {description ? <p className="max-w-xl text-body text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title || actions ? (
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            {title ? <h2 className="text-heading-3 text-fg">{title}</h2> : null}
            {description ? <p className="text-body-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
