import { type ReactNode } from "react";
import { notFound } from "next/navigation";

/**
 * Gate the living styleguide. It's a dev-only surface (renders every primitive
 * in every state) and must not be reachable on a public deployment.
 *
 * This mirrors the admin cloak: a server component that calls notFound() so the
 * entire /design subtree returns Next's real 404 in production — no redirect, no
 * hint that the route exists. The (large) client page underneath never renders.
 *
 * Escape hatch: set ENABLE_STYLEGUIDE=true to expose it on a specific deploy
 * (e.g. a staging preview for design review) without shipping it to prod.
 */
export default function DesignLayout({ children }: { children: ReactNode }) {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_STYLEGUIDE === "true";

  if (!enabled) notFound();

  return <>{children}</>;
}
