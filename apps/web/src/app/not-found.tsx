import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Branded 404. Next serves this for genuinely unknown routes and for the
 * cloaked surfaces (admin/design) that call notFound() — so a probing visitor
 * sees the same on-brand dead end as a mistyped URL, with a clear way back into
 * the product.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-6 px-4 pb-24 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-muted"
        aria-hidden
      >
        <Compass className="h-6 w-6" />
      </span>

      <div className="space-y-2">
        <p className="text-overline uppercase text-rival">Error 404</p>
        <h1 className="font-display text-heading-1 text-fg">Page not found</h1>
        <p className="text-body text-muted">
          This page doesn&rsquo;t exist or may have moved. Let&rsquo;s get you back to the action.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <Link href="/arena" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
          Browse open duels
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
          Go home
        </Link>
      </div>
    </main>
  );
}
