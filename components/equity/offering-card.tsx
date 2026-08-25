import Link from 'next/link'
import { Badge, Card } from '@/components/ui/primitives'
import { assetNoun, stateName } from '@/lib/deal/display'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { Deal, Facility } from '@/types'
import type { InvestorMatch, Offering, OfferingTerms } from '@/types/equity'

/**
 * One opportunity in the marketplace.
 *
 * Shows what an investor needs to decide whether to look closer. Target
 * figures are labelled as targets everywhere they appear — on a card as much
 * as on the detail page, because a card is what gets screenshotted and shared.
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

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{offering.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {[beds ? `${beds}-bed` : null, assetNoun(deal.asset_type), location].filter(Boolean).join(' · ')}
          </p>
        </div>
        {match ? (
          <div className="shrink-0 text-right">
            <div className="text-[17px] font-semibold tabular-nums text-ink">{match.score}%</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-muted">Fit</div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        <Cell label="Target raise" value={formatCurrency(offering.target_raise, { compact: true })} />
        <Cell label="Minimum" value={formatCurrency(offering.minimum_investment, { compact: true })} />
        <Cell
          label="Structure"
          value={terms?.capital_position === 'preferred_equity' ? 'Preferred equity' : 'Common equity'}
        />
        <Cell
          label="Target hold"
          value={terms?.target_hold_months ? `${Math.round(terms.target_hold_months / 12)} years` : '—'}
        />
        <Cell
          label="Target return"
          value={terms?.target_irr_pct ? `${formatPercent(terms.target_irr_pct)} IRR` : '—'}
          hint={terms?.target_irr_pct ? 'Target' : undefined}
        />
        <Cell
          label="Preferred return"
          value={terms?.preferred_return_pct ? formatPercent(terms.preferred_return_pct * 100) : '—'}
          hint={terms?.preferred_return_pct ? 'Target' : undefined}
        />
      </div>

      {committedPct !== null && committedPct !== undefined ? (
        <div className="border-t border-line px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-ink-muted">
            <span>{formatCurrency(offering.committed_amount, { compact: true })} committed</span>
            <span className="tabular-nums">{Math.round(committedPct * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, committedPct * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <Badge tone={offering.status === 'live' ? 'positive' : 'neutral'}>
          {offering.status === 'live' ? 'Open' : offering.status === 'fully_subscribed' ? 'Fully subscribed' : 'Closed'}
        </Badge>
        <Link
          href={`/investments/${offering.id}`}
          className="text-[12px] font-medium text-accent hover:underline"
        >
          Review offering →
        </Link>
      </div>
    </Card>
  )
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-muted">
        {label}
        {hint ? <span className="rounded bg-surface-sunken px-1 text-[9px] text-ink-muted">{hint}</span> : null}
      </div>
      <div className="mt-0.5 text-[13px] font-medium tabular-nums text-ink">{value}</div>
    </div>
  )
}
