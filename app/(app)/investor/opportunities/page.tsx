import { redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { Alert, EmptyState, PageHeader, Section, CardBody } from '@/components/ui/primitives'
import { OfferingCard } from '@/components/equity/offering-card'
import { matchesForInvestor } from '@/services/equity/matching'
import { matchHeadline } from '@/lib/equity/matching'
import type { Deal, Facility } from '@/types'
import type { InvestorMatch, Offering, OfferingTerms } from '@/types/equity'

export const dynamic = 'force-dynamic'

interface Row {
  match: InvestorMatch
  offering: Offering
  terms: OfferingTerms | null
  deal: Deal
  facility: Facility | null
}

/**
 * Opportunities grouped by how they relate to what the investor said they look
 * for. The grouping is the disclosure: "consistent with your preferences" is a
 * claim about the preferences, not about the investment.
 */
export default async function OpportunitiesPage() {
  const actor = await requireActor()
  if (!actor.investor) redirect('/investor/onboarding')

  const store = await db()
  const matches = await matchesForInvestor(actor.investor.id)

  const rows: Row[] = []
  for (const { match, offering } of matches) {
    const [terms, deal] = await Promise.all([
      store.selectOne('offering_terms', { where: { offering_id: offering.id } }),
      store.findById('deals', offering.deal_id),
    ])
    if (!deal) continue
    const facility = await store.selectOne('facilities', { where: { deal_id: deal.id } })
    rows.push({ match, offering, terms, deal, facility })
  }

  const strong = rows.filter((r) => r.match.band === 'strong')
  const possible = rows.filter((r) => r.match.band === 'possible')
  const closingSoon = rows
    .filter((r) => r.offering.offering_end_date !== null)
    .sort((a, b) => (a.offering.offering_end_date ?? '').localeCompare(b.offering.offering_end_date ?? ''))
    .slice(0, 3)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Matches"
        title="Opportunities for you"
        description="Ranked by how each offering compares with the preferences you set — not by size of raise, and not by what any sponsor pays."
      />

      <Alert tone="neutral">
        These are informational matches against your stated preferences, not individualised
        investment advice and not recommendations. CareCapital Exchange is not your adviser.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState
          title="No open offerings match your preferences yet"
          description="You will be notified when one is published. You can also browse everything currently open."
        />
      ) : (
        <>
          <Group title="Consistent with your preferences" rows={strong} />
          <Group title="Partially consistent" rows={possible} />
          {closingSoon.length > 0 ? <Group title="Closing soonest" rows={closingSoon} /> : null}
        </>
      )}
    </div>
  )
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null
  return (
    <Section title={title}>
      <CardBody>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.match.id} className="space-y-2">
              <OfferingCard
                offering={row.offering}
                terms={row.terms}
                deal={row.deal}
                facility={row.facility}
                match={row.match}
              />
              <div className="space-y-1 px-1 text-[11px] leading-relaxed">
                <p className="font-medium text-ink-secondary">{matchHeadline({
                  score: row.match.score, band: row.match.band, reasons: row.match.reasons,
                  concerns: row.match.concerns, ineligible: row.match.ineligible,
                  ineligibleReason: row.match.ineligible_reason,
                })}</p>
                {row.match.reasons.slice(0, 3).map((reason) => (
                  <p key={reason} className="text-ink-muted">✓ {reason}</p>
                ))}
                {row.match.concerns.slice(0, 2).map((concern) => (
                  <p key={concern} className="text-amber-700">⚠ {concern}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Section>
  )
}
