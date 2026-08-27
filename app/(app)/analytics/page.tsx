import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { borrowerAnalytics } from '@/services/analytics'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { Card, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { BarChart } from '@/components/charts'
import { MetricTile } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import { requireDebtMarketplace } from '@/lib/product'

export const metadata: Metadata = { title: 'Analytics' }

export default async function AnalyticsPage() {
  requireDebtMarketplace()
  const actor = await requireActor()
  if (actor.isLender) redirect('/lender/analytics')
  if (actor.isAdmin) redirect('/admin')

  const store = await db()
  const [analytics, deals] = await Promise.all([
    borrowerAnalytics(actor.company.id),
    store.select('deals', { where: { company_id: actor.company.id } }),
  ])

  const snapshots = (await Promise.all(deals.map((deal) => buildSnapshot(deal.id))))
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null)

  const byState = new Map<string, number>()
  for (const snapshot of snapshots) {
    const state = snapshot.facility?.state ?? 'Unknown'
    byState.set(state, (byState.get(state) ?? 0) + (snapshot.summary.loanAmount ?? 0))
  }

  const withMetrics = snapshots.filter((snapshot) => snapshot.summary.ltv !== null)
  const average = (pick: (snapshot: (typeof snapshots)[number]) => number | null) => {
    const values = snapshots.map(pick).filter((value): value is number => value !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={actor.company.name}
        title="Portfolio analytics"
        description="How your financing process is performing, across every deal on the platform."
      />

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Capital requested" value={formatCurrency(analytics.capitalRequested, { compact: true })} />
          <MetricTile label="Capital funded" value={formatCurrency(analytics.capitalFunded, { compact: true })} />
          <MetricTile label="Average matches per deal" value={analytics.averageMatchesPerDeal} />
          <MetricTile label="Indications received" value={analytics.indicationsReceived} />
          <MetricTile
            label="Median days to first indication"
            value={analytics.medianDaysToFirstIndication ?? '—'}
            detail="From distribution"
          />
          <MetricTile
            label="Lender response rate"
            value={formatPercent(analytics.lenderResponseRatePct)}
            detail="Opened or engaged"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Capital requested by state">
          <CardBody>
            {byState.size ? (
              <BarChart
                series={[...byState.entries()].map(([state, amount]) => ({ label: state, value: amount }))}
                format={(value) => formatCurrency(value, { compact: true })}
                height={150}
              />
            ) : (
              <p className="text-[12px] text-ink-muted">No deals with a facility state yet.</p>
            )}
          </CardBody>
        </Section>

        <Section title="Portfolio averages" description="Across every deal with computable metrics.">
          <div className="data-grid grid-cols-2">
            <MetricTile label="Average LTV" value={formatPercent(average((s) => s.summary.ltv))} />
            <MetricTile label="Average DSCR" value={formatRatio(average((s) => s.summary.dscr))} />
            <MetricTile label="Average debt yield" value={formatPercent(average((s) => s.summary.debtYield))} />
            <MetricTile label="Average occupancy" value={formatPercent(average((s) => s.facility?.occupancy_pct ?? s.summary.occupancyPct))} />
            <MetricTile label="Average EBITDA margin" value={formatPercent(average((s) => s.summary.ebitdaMargin))} />
            <MetricTile
              label="Average indication rate"
              value={formatPercent(analytics.averageIndicationRatePct, 2)}
              detail="Across indications received"
            />
          </div>
        </Section>
      </div>

      <Section title="Deal detail" description={`${withMetrics.length} deals with computable metrics.`}>
        <Table>
          <thead>
            <tr>
              <Th>Deal</Th><Th>State</Th><Th>Status</Th>
              <Th numeric>Request</Th><Th numeric>LTV</Th><Th numeric>DSCR</Th>
              <Th numeric>Debt yield</Th><Th numeric>Occupancy</Th><Th numeric>EBITDA margin</Th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <Tr key={snapshot.deal.id}>
                <Td className="max-w-56 truncate text-ink">{snapshot.facility?.name ?? snapshot.deal.name}</Td>
                <Td>{snapshot.facility?.state ?? '—'}</Td>
                <Td className="text-ink-secondary">{titleize(snapshot.deal.status)}</Td>
                <Td numeric>{formatCurrency(snapshot.summary.loanAmount, { compact: true })}</Td>
                <Td numeric>{formatPercent(snapshot.summary.ltv)}</Td>
                <Td numeric>{formatRatio(snapshot.summary.dscr)}</Td>
                <Td numeric>{formatPercent(snapshot.summary.debtYield)}</Td>
                <Td numeric>{formatPercent(snapshot.facility?.occupancy_pct ?? snapshot.summary.occupancyPct)}</Td>
                <Td numeric>{formatPercent(snapshot.summary.ebitdaMargin)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
