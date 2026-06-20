'use client'

/**
 * Admin section error boundary (Next.js App Router).
 *
 * Scoped to the /admin/* route segment so that an admin panel crash does not
 * affect the public-facing site. Shows a stripped-down recovery UI consistent
 * with the admin shell style.
 */

import { useEffect } from 'react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[AdminErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-lg border border-border bg-surface p-8 shadow-sm max-w-md w-full space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Admin panel error</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred in the admin panel.
          </p>
        </div>

        {process.env.NODE_ENV !== 'production' && (
          <pre className="rounded bg-surface-2 p-3 text-left text-xs text-red-400 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}

        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Reload panel
        </button>
      </div>
    </div>
  )
}
