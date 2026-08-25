import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { OfferingCard } from '@/components/equity/offering-card'
import { Alert, EmptyState, PageHeader } from '@/components/ui/primitives'
import { matchesForInvestor } from '@/services/equity/matching'
import type { Deal, Facility } from '@/types'
import type { InvestorMatch, Offering, OfferingTerms } from '@/types/equity'

export const dynamic = 'force-dynamic'

/**
 * The investment marketplace.
 *
 * Institutional in tone by intent: dense figures, no urgency devices, no
 * countdowns, no social proof. An investor deciding where to put six figures
 * is served by information, not persuasion.
 */
export default async function InvestmentsPage() {
  const actor = await requireActor()
  if (!isAvailable('EQUITY_MARKETPLACE_ENABLED')) {
    return (
      <Alert tone="neutral" title="The equity marketplace is not enabled">
        This deployment is configured for debt financing only.
      </Alert>
    )
  }

  const store = await db()
  const live = await store.select('offerings', { orderBy: { field: 'published_at', dir: 'desc' } })
  const published = live.filter((o) => ['live', 'fully_subscribed'].includes(o.status))

  const matchByOffering = new Map<string, InvestorMatch>()
  if (actor.investor) {
    const matches = await matchesForInvestor(actor.investor.id, { includeIneligible: true })
    for (const row of matches) matchByOffering.set(row.offering.id, row.match)
  }

  const rows: {
    offering: Offering; terms: OfferingTerms | null; deal: Deal; facility: Facility | null
  }[] = []
  for (const offering of published) {
    const [terms, deal] = await Promise.all([
      store.selectOne('offering_terms', { where: { offering_id: offering.id } }),
      store.findById('deals', offering.deal_id),
    ])
    if (!deal) continue
    const facility = await store.selectOne('facilities', { where: { deal_id: deal.id } })
    rows.push({ offering, terms, deal, facility })
  }

  // Ordered by fit where the viewer is an investor with preferences set, and
  // by recency otherwise. Never by size of raise, and never by who is paying.
  rows.sort((a, b) => {
    const scoreA = matchByOffering.get(a.offering.id)?.score ?? -1
    const scoreB = matchByOffering.get(b.offering.id)?.score ?? -1
    return scoreB - scoreA
  })

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Opportunities"
        title="Healthcare investment marketplace"
        description="Private healthcare investments. Every figure shown is drawn from the sponsor's own submission and is labelled as historical, projected or targeted."
      />

      <Alert tone="neutral">
        CareCapital Exchange is not a broker-dealer, investment adviser or funding portal, and
        nothing here is a recommendation to invest. Private investments are illiquid and can lose
        their entire value.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState
          title="No offerings are open"
          description="There are no published investment opportunities at the moment. You will be notified when one matching your preferences opens."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ offering, terms, deal, facility }) => (
            <OfferingCard
              key={offering.id}
              offering={offering}
              terms={terms}
              deal={deal}
              facility={facility}
              match={matchByOffering.get(offering.id) ?? null}
              committedPct={
                offering.target_raise && offering.target_raise > 0
                  ? offering.committed_amount / offering.target_raise
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
