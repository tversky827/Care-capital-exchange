'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Application error boundary.
 *
 * Never renders a stack trace. The digest is shown because it is the only thing
 * that ties what the user saw to what the server logged, and it contains no
 * information about the deal or the failure.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ui] unhandled error', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-line bg-surface p-6">
        <div className="flex items-center gap-2 text-critical">
          <AlertTriangle className="size-4" />
          <p className="text-[13px] font-semibold">Something went wrong</p>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
          The page could not be loaded. Nothing you were working on has been lost — deal data is only
          written when you save it.
        </p>
        {error.digest ? (
          <p className="mt-3 border border-line bg-surface-sunken px-2 py-1.5 font-mono text-[11px] text-ink-muted">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-8 border border-accent bg-accent px-3 text-[13px] font-medium text-white rounded-[3px] hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="flex h-8 items-center border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink rounded-[3px] hover:bg-surface-sunken"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
