import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { requireActor } from '@/lib/auth/session'
import { lenderAnalytics } from '@/services/analytics'
import { pipelineForLender } from '@/services/distribution'
import { Card, CardBody, Section } from '@/components/ui/primitives'
import { BarChart } from '@/components/charts'
import { MetricTile } from '@/components/deal/common'
import { formatCurrency, formatPercent, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Lender analytics' }

export default async function LenderAnalyticsPage() {
  const actor = await requireActor()
  if (!actor.isLender) redirect(actor.isAdmin ? '/admin' : '/dashboard')
  const lender = actor.lender
  if (!lender) redirect('/lender')

  const [analytics, distributions] = await Promise.all([
    lenderAnalytics(lender.id),
    pipelineForLender(lender.id),
  ])

  const byStage = new Map<string, number>()
  for (const distribution of distributions.filter((entry) => entry.status !== 'revoked')) {
    byStage.set(distribution.pipeline_stage, (byStage.get(distribution.pipeline_stage) ?? 0) + 1)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">{lender.institution_name}</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Analytics</h1>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Your own origination performance. No other institution&apos;s figures are visible here, and
          yours are not visible to them.
        </p>
      </div>

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <MetricTile label="Opportunities received" value={analytics.dealsReceived} />
          <MetricTile label="Opened" value={analytics.dealsViewed} detail={analytics.viewRatePct !== null ? `${analytics.viewRatePct}% view rate` : undefined} />
          <MetricTile label="Pursued" value={analytics.dealsPursued} />
          <MetricTile label="Indications submitted" value={analytics.indicationsSubmitted} />
          <MetricTile label="Selected by borrower" value={analytics.indicationsSelected} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pipeline by stage">
          <CardBody>
            {byStage.size ? (
              <BarChart
                series={[...byStage.entries()].map(([stage, count]) => ({ label: titleize(stage), value: count }))}
                height={140}
              />
            ) : (
              <p className="text-[12px] text-ink-muted">No opportunities in your pipeline yet.</p>
            )}
          </CardBody>
        </Section>

        <Section title="Terms you have quoted">
          <div className="data-grid grid-cols-2">
            <MetricTile label="Average loan amount" value={formatCurrency(analytics.averageLoanAmount, { compact: true })} />
            <MetricTile label="Average rate quoted" value={formatPercent(analytics.averageRatePct, 2)} />
            <MetricTile label="Average LTV seen" value={formatPercent(analytics.averageLtvPct)} />
            <MetricTile
              label="Conversion"
              value={formatPercent(analytics.conversionRatePct)}
              detail="Indications submitted per opportunity opened"
            />
          </div>
        </Section>
      </div>

      <Section title="Responsiveness" description="Borrowers see this as a signal when choosing who to distribute to.">
        <CardBody>
          <div className="max-w-md">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-secondary">Responsiveness score</span>
              <span className="tnum text-[18px] font-semibold text-ink">{lender.responsiveness_score}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-accent" style={{ width: `${lender.responsiveness_score}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              Derived from how quickly your institution opens and responds to opportunities. It
              contributes 8% of marketplace relevance ranking, and no borrower sees the underlying
              figures.
            </p>
          </div>
        </CardBody>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
