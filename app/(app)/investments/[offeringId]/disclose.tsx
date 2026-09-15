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

/**
 * A whole section that opens on request.
 *
 * The same `<details>` mechanics as `Disclose`, at the scale of a page
 * section, with room for the one figure that says whether opening it is
 * worthwhile — the risk score, the number of documents.
 *
 * Collapsing these is the difference between a deal page you read and one you
 * scroll past. Everything an investor needs to decide whether to keep going is
 * above them; everything they need to actually decide is inside them, one tap
 * away, and still in the DOM for find-in-page.
 */
export function Fold({
  title, meta, children, defaultOpen = false, id,
}: {
  title: string
  /** A figure or count shown on the right of the header. */
  meta?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  /** So a link elsewhere on the page can point at this section. */
  id?: string
}) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-4 border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
        <span className="flex-1 text-[14px] font-semibold text-ink">{title}</span>
        {meta ? <span className="shrink-0 text-[12px] text-ink-muted">{meta}</span> : null}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  )
}
