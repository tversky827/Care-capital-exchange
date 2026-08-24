import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canViewDealIdentity, isMarketplaceVisible } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { matchDeal, relevanceScore, BAND_LABELS } from '@/lib/matching/engine'
import { toMatchableBox, toMatchableDeal } from '@/services/matching'
import { scoreDeal } from '@/lib/underwriting/score'
import { savedSearches } from '@/services/lenders'
import { displayName, displayLocation } from '@/lib/deal/display'
import {
  Alert, Badge, Button, Card, CardBody, EmptyState, Section, type Tone,
} from '@/components/ui/primitives'
import { MarketplaceFilters } from './filters'
import { SavedSearches } from './saved-searches'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import { ASSET_TYPES, TRANSACTION_TYPES } from '@/types'

export const metadata: Metadata = { title: 'Marketplace' }

const BAND_TONE: Record<string, Tone> = {
  strong: 'positive', good: 'accent', possible: 'warning', outside_box: 'neutral',
}

/**
 * Lender marketplace.
 *
 * Deals here are discoverable, not distributed: a lender browsing sees the
 * anonymised summary and the metrics needed to decide whether to ask for
 * access. The data room and the facility identity stay closed until the
 * borrower distributes the deal to them.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const actor = await requireActor()
  if (!actor.isLender && !actor.isAdmin) redirect('/dashboard')

  const lender = actor.lender
  if (actor.isLender && lender?.verification_status !== 'verified') {
    return (
      <Alert tone="warning" title="Marketplace access requires verification">
        A platform administrator reviews every lending institution before it can browse borrower
        opportunities. You can configure your lending box in the meantime.
      </Alert>
    )
  }

  const params = await searchParams
  const store = await db()

  const [deals, box, searches] = await Promise.all([
    store.select('deals', { orderBy: { field: 'distributed_at', dir: 'desc' } }),
    lender ? store.selectOne('lender_lending_boxes', { where: { lender_id: lender.id } }) : Promise.resolve(null),
    savedSearches(actor),
  ])

  const subject = subjectOf(actor)
  const distributions = lender
    ? await store.select('deal_distributions', { where: { lender_id: lender.id } })
    : []
  const distributionByDeal = new Map(distributions.map((entry) => [entry.deal_id, entry]))

  // Discoverable = on the marketplace, or already distributed to this lender.
  const candidates = deals.filter(
    (deal) => isMarketplaceVisible(deal) || distributionByDeal.has(deal.id),
  )

  const rows = (
    await Promise.all(
      candidates.map(async (deal) => {
        const snapshot = await buildSnapshot(deal.id)
        if (!snapshot) return null
        const matchable = toMatchableDeal(snapshot)
        const match = box ? matchDeal(matchable, toMatchableBox(box)) : null
        const quality = scoreDeal(snapshot)
        const distribution = distributionByDeal.get(deal.id) ?? null
        return {
          deal,
          snapshot,
          match,
          quality,
          distribution,
          canSeeIdentity: canViewDealIdentity(subject, deal, { distribution }),
          relevance: relevanceScore({
            matchScore: match?.score ?? 50,
            dealQualityScore: quality.overall,
            daysToClose: matchable.daysToClose,
            lenderResponsiveness: lender?.responsiveness_score ?? 50,
          }),
        }
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null)

  // --- Filters ------------------------------------------------------------
  const filtered = rows.filter(({ snapshot, match }) => {
    const { facility, summary, deal, metrics } = snapshot
    if (params.state && facility?.state !== params.state.toUpperCase()) return false
    if (params.asset && deal.asset_type !== params.asset) return false
    if (params.transaction && deal.transaction_type !== params.transaction) return false
    if (params.minLoan && (summary.loanAmount ?? 0) < Number(params.minLoan)) return false
    if (params.maxLoan && (summary.loanAmount ?? Infinity) > Number(params.maxLoan)) return false
    if (params.maxLtv && summary.ltv !== null && summary.ltv > Number(params.maxLtv)) return false
    if (params.minDscr && summary.dscr !== null && summary.dscr < Number(params.minDscr)) return false
    if (params.minDebtYield && summary.debtYield !== null && summary.debtYield < Number(params.minDebtYield)) return false
    if (params.minOccupancy) {
      const occupancy = facility?.occupancy_pct ?? summary.occupancyPct
      if (occupancy !== null && occupancy < Number(params.minOccupancy)) return false
    }
    if (params.maxMedicaid && metrics?.medicaid_pct != null && metrics.medicaid_pct > Number(params.maxMedicaid)) return false
    if (params.inBox === 'yes' && match?.hardFail !== false) return false
    return true
  })

  const ranked = [...filtered].sort((a, b) => b.relevance - a.relevance)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Opportunities</p>
          <h1 className="mt-1 text-[20px] font-semibold text-ink">Marketplace</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
            Ranked by relevance — a blend of fit against your criteria, how complete the package is,
            closing timeline and your own responsiveness. Not by who is paying the most.
          </p>
        </div>
        <span className="tnum text-[12px] text-ink-muted">
          {ranked.length} of {rows.length} opportunities
        </span>
      </div>

      <MarketplaceFilters
        assetTypes={[...ASSET_TYPES]}
        transactionTypes={[...TRANSACTION_TYPES]}
        states={[...new Set(rows.map((row) => row.snapshot.facility?.state).filter(Boolean))].sort() as string[]}
      />

      {searches.length > 0 ? <SavedSearches searches={searches.map((entry) => ({ id: entry.id, name: entry.name, alertEnabled: entry.alert_enabled }))} /> : null}

      {ranked.length === 0 ? (
        <Card>
          <EmptyState
            title="No opportunities match these filters"
            description="Clear a filter, or widen your lending box to see opportunities you are currently screening out."
            action={<Link href="/marketplace"><Button>Clear filters</Button></Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {ranked.map(({ deal, snapshot, match, quality, distribution, canSeeIdentity }) => {
            const { facility, summary, metrics } = snapshot
            return (
              <Card key={deal.id} className="flex flex-col">
                <div className="border-b border-line px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/lender/deals/${deal.id}`}
                        className="block truncate text-[14px] font-semibold text-ink hover:text-accent hover:underline"
                      >
                        {displayName(deal, facility, canSeeIdentity)}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {displayLocation(facility, canSeeIdentity)} · {titleize(deal.transaction_type)}
                      </p>
                    </div>
                    {match ? (
                      <div className="shrink-0 text-right">
                        <p className="tnum text-[18px] font-semibold leading-none text-ink">{match.score}%</p>
                        <Badge tone={BAND_TONE[match.band] ?? 'neutral'} className="mt-1">
                          {BAND_LABELS[match.band]}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                  {distribution && distribution.status !== 'revoked' ? (
                    <Badge tone="accent" className="mt-2">Shared with you · {titleize(distribution.pipeline_stage)}</Badge>
                  ) : (
                    <Badge tone="neutral" className="mt-2">Marketplace listing</Badge>
                  )}
                </div>

                <dl className="data-grid grid-cols-3">
                  <MarketCell label="Request" value={formatCurrency(summary.loanAmount, { compact: true })} />
                  <MarketCell label="LTV" value={formatPercent(summary.ltv, 0)} />
                  <MarketCell label="DSCR" value={formatRatio(summary.dscr)} />
                  <MarketCell label="Debt yield" value={formatPercent(summary.debtYield, 1)} />
                  <MarketCell label="Occupancy" value={formatPercent(facility?.occupancy_pct ?? summary.occupancyPct, 0)} />
                  <MarketCell label="Medicaid" value={formatPercent(metrics?.medicaid_pct ?? null, 0)} />
                  <MarketCell label="Beds" value={String(facility?.licensed_beds ?? '—')} />
                  <MarketCell label="EBITDA" value={formatCurrency(summary.ebitda, { compact: true })} />
                  <MarketCell label="Purchase" value={formatCurrency(snapshot.terms?.purchase_price ?? null, { compact: true })} />
                </dl>

                <CardBody className="flex-1">
                  {match?.concerns.length ? (
                    <ul className="space-y-1">
                      {match.concerns.slice(0, 2).map((concern) => (
                        <li key={concern} className="flex gap-1.5 text-[11px] leading-snug text-warning">
                          <span>⚠</span>
                          <span className="min-w-0">{concern}</span>
                        </li>
                      ))}
                    </ul>
                  ) : match ? (
                    <p className="text-[11px] leading-snug text-positive">
                      ✓ No stated criterion is in tension with this opportunity.
                    </p>
                  ) : null}
                </CardBody>

                <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
                  <span className="text-[11px] text-ink-muted">
                    Package {quality.overall}/100
                    {snapshot.terms?.target_close_date
                      ? ` · closes ${new Date(snapshot.terms.target_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : ''}
                  </span>
                  <Link href={`/lender/deals/${deal.id}`}>
                    <Button size="sm" variant="primary">Review</Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Section title="How ranking works" description="Relevance is configurable and never bid-weighted.">
        <CardBody>
          <ul className="grid gap-2 text-[12px] leading-relaxed text-ink-secondary sm:grid-cols-2">
            <li>· <strong className="text-ink">55%</strong> fit against your published lending criteria</li>
            <li>· <strong className="text-ink">25%</strong> completeness and quality of the financing package</li>
            <li>· <strong className="text-ink">12%</strong> closing timeline</li>
            <li>· <strong className="text-ink">8%</strong> your institution&apos;s responsiveness on past opportunities</li>
          </ul>
        </CardBody>
      </Section>
    </div>
  )
}

function MarketCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <dt className="text-[9px] uppercase tracking-[0.06em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[13px] font-semibold text-ink">{value}</dd>
    </div>
  )
}

export const dynamic = 'force-dynamic'
