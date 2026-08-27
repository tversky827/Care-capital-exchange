import { ChevronRight } from 'lucide-react'

/**
 * A section that opens on request.
 *
 * Built on `<details>` rather than React state so it needs no JavaScript, is
 * keyboard-operable and screen-reader-announced for free, and — the reason it
 * matters here — its contents are in the DOM whether or not it is open, so a
 * browser's find-in-page still reaches them. An investor searching the page for
 * "Medicaid" should not be defeated by a collapsed heading.
 */
export function Disclose({
  summary, children, defaultOpen = false,
}: {
  summary: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line pt-2.5 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[13px] font-medium text-ink-secondary hover:text-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="pb-2 pt-2.5">{children}</div>
    </details>
  )
}
