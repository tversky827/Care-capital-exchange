import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { stateName } from '@/lib/deal/display'
import { offeringTitle } from '@/lib/equity/display'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { Deal, Facility } from '@/types'
import type { Offering, OfferingTerms } from '@/types/equity'

/**
 * One opportunity, as a row.
 *
 * A row rather than a card, and two figures rather than five. The card this
 * replaced carried a target return, a minimum, a progress bar, a status badge
 * and a match percentage — a small table, repeated fifteen times, which is
 * five tables to read before you have opened anything.
 *
 * A list exists to be scanned for the one you want to open. That needs a name,
 * where it is, what it targets, and what it takes to get in. Everything else
 * is on the page behind it, where there is room for it.
 *
 * No status badge: a raise that is not open is not in this list. No progress
 * bar: how much is left changes nothing about whether this is the right
 * investment, and a bar filling up is precisely the kind of pressure this
 * product should not apply.
 */
export function OfferingRow({
  offering, terms, deal, facility, revealIdentity = false,
}: {
  offering: Offering
  terms: OfferingTerms | null
  deal: Deal
  facility: Facility | null
  revealIdentity?: boolean
}) {
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const where = facility?.state ? stateName(facility.state) : null

  return (
    <Link
      href={`/investments/${offering.id}`}
      className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-sunken focus:outline-none focus-visible:bg-surface-sunken"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">
          {offeringTitle(offering, deal, facility, revealIdentity)}
        </span>
        <span className="block truncate text-[12px] text-ink-muted">
          {[where, beds ? `${beds} beds` : null].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tnum block text-[15px] font-semibold text-ink">
          {terms?.target_irr_pct ? formatPercent(terms.target_irr_pct) : '—'}
        </span>
        <span className="block text-[11px] text-ink-muted">
          {offering.minimum_investment
            ? `${formatCurrency(offering.minimum_investment, { compact: true })} min`
            : 'no minimum'}
        </span>
      </span>

      <ChevronRight className="size-4 shrink-0 text-ink-muted" />
    </Link>
  )
}
