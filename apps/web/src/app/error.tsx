'use client'

/**
 * Root error boundary page (Next.js App Router).
 *
 * Catches unhandled errors thrown during rendering of any route segment under
 * the root layout. Displayed instead of the crashed page — keeps the site
 * partially functional rather than serving a blank screen.
 */

import { useEffect } from 'react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to monitoring (swap for Sentry / Datadog in production)
    console.error('[ErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">
          Something went wrong
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted">
          An unexpected error interrupted this page. Try again — if it keeps happening, the issue is
          on our side.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-faint">Error ID: {error.digest}</p>
        )}
      </div>

      <button
        onClick={reset}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-rival px-4 text-sm font-medium text-rival-fg transition-all hover:brightness-110 focus-visible:focus-ring active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  )
}
