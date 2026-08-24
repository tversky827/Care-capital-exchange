import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { platformAnalytics } from '@/services/analytics'
import { usageSummary } from '@/services/ai-usage'
import { listJobs } from '@/services/jobs'
import { Badge, Card, CardHeader, CardTitle, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { BarChart } from '@/components/charts'
import { MetricTile, NextAction } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRelative, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminOverviewPage() {
  await requireAdmin()
  const store = await db()

  const [analytics, usage, deadJobs, pendingLenders, recentAudit, deals] = await Promise.all([
    platformAnalytics(),
    usageSummary(),
    listJobs({ status: 'dead' }, 20),
    store.select('lenders', { where: { verification_status: 'pending' } }),
    store.select('audit_logs', { orderBy: { field: 'created_at', dir: 'desc' }, limit: 12 }),
    store.select('deals', {}),
  ])

  const byStatus = new Map<string, number>()
  for (const deal of deals) byStatus.set(deal.status, (byStatus.get(deal.status) ?? 0) + 1)

  const users = await store.select('users', {})
  const userName = new Map(users.map((user) => [user.id, user.full_name]))

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Platform operations</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Marketplace overview</h1>
      </div>

      {pendingLenders.length > 0 ? (
        <NextAction
          tone="warning"
          headline={`${pendingLenders.length} lender${pendingLenders.length === 1 ? '' : 's'} awaiting verification`}
          detail="Unverified institutions cannot receive opportunities or browse the marketplace."
          items={pendingLenders.slice(0, 4).map((lender) => ({ label: lender.institution_name, href: '/admin/lenders' }))}
          action={{ href: '/admin/lenders', label: 'Review lenders' }}
        />
      ) : deadJobs.length > 0 ? (
        <NextAction
          tone="critical"
          headline={`${deadJobs.length} background job${deadJobs.length === 1 ? '' : 's'} exhausted their retries`}
          detail="These are documents or analyses that never completed. Each can be retried from the jobs console."
          action={{ href: '/admin/jobs', label: 'Open job queue' }}
        />
      ) : (
        <NextAction
          tone="positive"
          headline="Nothing needs administrator attention"
          detail="No pending verifications and no failed background work."
        />
      )}

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <MetricTile label="Total users" value={analytics.totalUsers} />
          <MetricTile label="Borrower organisations" value={analytics.borrowerCompanies} />
          <MetricTile label="Lending institutions" value={analytics.lenderCompanies} />
          <MetricTile label="Active deals" value={analytics.activeDeals} detail={`${deals.length} total`} />
          <MetricTile label="Total indications" value={analytics.totalIndications} />
          <MetricTile label="Capital requested" value={formatCurrency(analytics.totalRequestedCapital, { compact: true })} />
          <MetricTile label="Capital funded" value={formatCurrency(analytics.totalFundedCapital, { compact: true })} />
          <MetricTile label="Average deal size" value={formatCurrency(analytics.averageDealSize, { compact: true })} />
          <MetricTile label="Average match score" value={analytics.averageMatchScore ?? '—'} />
          <MetricTile
            label="Median days to indication"
            value={analytics.medianDaysToIndication ?? '—'}
            detail="From distribution"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Deals by status">
          <div className="p-4">
            <BarChart
              series={[...byStatus.entries()].map(([status, count]) => ({ label: titleize(status), value: count }))}
              height={150}
            />
          </div>
        </Section>

        <Section title="Marketplace health">
          <div className="data-grid grid-cols-2">
            <MetricTile
              label="Lender participation"
              value={formatPercent(analytics.lenderParticipationRatePct)}
              detail="Institutions that opened at least one opportunity"
            />
            <MetricTile
              label="Deal conversion"
              value={formatPercent(analytics.dealConversionRatePct)}
              detail="Distributed deals receiving an indication"
            />
            <MetricTile
              label="AI spend, month to date"
              value={formatCurrency(usage.monthToDateUsd, { decimals: 2 })}
              detail={`${usage.budgetUsedPct}% of the ${formatCurrency(usage.budgetUsd)} budget`}
              tone={usage.budgetUsedPct > 90 ? 'critical' : usage.budgetUsedPct > 70 ? 'warning' : undefined}
            />
            <MetricTile label="AI calls" value={usage.callCount} />
          </div>
        </Section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent platform activity</CardTitle>
          <Link href="/admin/audit" className="text-[12px] text-accent hover:underline">Full audit log</Link>
        </CardHeader>
        <Table>
          <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Summary</Th></tr></thead>
          <tbody>
            {recentAudit.map((log) => (
              <Tr key={log.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatRelative(log.created_at)}</Td>
                <Td className="whitespace-nowrap text-ink-secondary">
                  {log.actor_id ? userName.get(log.actor_id) ?? 'Unknown' : 'Platform'}
                </Td>
                <Td><Badge tone="neutral">{log.action}</Badge></Td>
                <Td className="text-[12px] text-ink-secondary">{log.summary}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
