import Link from 'next/link'

/**
 * Not found.
 *
 * A deal the viewer is not entitled to see returns this rather than a 403, so
 * the route cannot be used to confirm that a deal exists.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-line bg-surface p-6">
        <p className="tnum text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">404</p>
        <h1 className="mt-1 text-[17px] font-semibold text-ink">Not found</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
          This page does not exist, or it belongs to an organisation you are not part of. A deal is
          only visible to the borrower that owns it and to the lenders they have shared it with.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/dashboard"
            className="flex h-8 items-center border border-accent bg-accent px-3 text-[13px] font-medium text-white rounded-[3px] hover:opacity-90"
          >
            Back to dashboard
          </Link>
          <Link
            href="/"
            className="flex h-8 items-center border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink rounded-[3px] hover:bg-surface-sunken"
          >
            Public site
          </Link>
        </div>
      </div>
    </div>
  )
}
