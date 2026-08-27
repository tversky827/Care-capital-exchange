import Link from 'next/link'
import { Badge, Card } from '@/components/ui/primitives'
import { assetNoun, stateName } from '@/lib/deal/display'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { Deal, Facility } from '@/types'
import type { InvestorMatch, Offering, OfferingTerms } from '@/types/equity'

/**
 * One opportunity in the marketplace.
 *
 * Three figures, not six. A card is for deciding whether to open something,
 * and an investor deciding that wants to know what it pays, what it costs to
 * get in, and how much of it is left. Structure, hold period and preferred
 * return are all real considerations — they are just not screening ones, and
 * putting them here made the six figures read as a table rather than an answer.
 *
 * Target figures are labelled as targets everywhere they appear — on a card as
 * much as on the detail page, because a card is what gets screenshotted and
 * shared.
 */
export function OfferingCard({
  offering, terms, deal, facility, match, committedPct,
}: {
  offering: Offering
  terms: OfferingTerms | null
  deal: Deal
  facility: Facility | null
  match?: InvestorMatch | null
  committedPct?: number | null
}) {
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const location = facility?.state ? stateName(facility.state) : null
  const pct = committedPct === null || committedPct === undefined ? null : Math.round(committedPct * 100)

  return (
    <Link
      href={`/investments/${offering.id}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Card className="flex h-full flex-col transition-colors group-hover:border-line-strong">
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink group-hover:text-accent">
              {offering.name}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {[beds ? `${beds}-bed` : null, assetNoun(deal.asset_type), location].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Badge tone={offering.status === 'live' ? 'positive' : 'neutral'}>
            {offering.status === 'live' ? 'Open' : offering.status === 'fully_subscribed' ? 'Fully subscribed' : 'Closed'}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-px border-y border-line bg-line">
          <Cell
            label="Target return"
            value={terms?.target_irr_pct ? formatPercent(terms.target_irr_pct) : '—'}
            hint={terms?.target_irr_pct ? 'a year, projected' : 'not stated'}
          />
          <Cell
            label="Minimum"
            value={formatCurrency(offering.minimum_investment, { compact: true })}
            hint="to invest"
          />
        </div>

        <div className="mt-auto px-4 py-3">
          {pct === null ? (
            <p className="text-[12px] text-ink-muted">
              {formatCurrency(offering.target_raise, { compact: true })} raise
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-secondary">
                  <span className="tnum font-medium text-ink">{pct}%</span> of{' '}
                  {formatCurrency(offering.target_raise, { compact: true })} raised
                </span>
                {match ? <span className="text-[11px] text-ink-muted">{match.score}% match</span> : null}
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </>
          )}
        </div>
      </Card>
    </Link>
  )
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="tnum mt-0.5 text-[17px] font-semibold text-ink">{value}</div>
      {hint ? <div className="text-[11px] text-ink-muted">{hint}</div> : null}
    </div>
  )
}
