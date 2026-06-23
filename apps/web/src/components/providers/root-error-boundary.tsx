'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Root error boundary — catches unhandled client-side errors so the entire
 * app doesn't white-screen. Wraps the AppProviders tree in layout.tsx (H-007).
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg p-8">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="font-display text-xl font-semibold text-fg">
              Something went wrong
            </h1>
            <p className="text-sm text-muted">
              An unexpected error interrupted the app. Reload to get back to your duels — if it keeps
              happening, the issue is on our side.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-rival px-4 text-sm font-medium text-rival-fg transition-all hover:brightness-110 focus-visible:focus-ring active:scale-[0.98]"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
