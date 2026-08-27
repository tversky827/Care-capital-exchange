import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { debtMarketplaceEnabled } from '@/lib/product'
import { borrowerAnalytics } from '@/services/analytics'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { readinessFor } from '@/services/underwriting'
import {
  Button, Card, CardHeader, CardTitle, EmptyState, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { DealStatusBadge, MetricTile, NextAction } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRatio, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Dashboard' }

/**
 * Borrower dashboard.
 *
 * Two jobs: show the portfolio at a glance, and name the single most useful
 * next action across every deal. The "next action" block is computed from
 * actual deal state — open indications first, then blocked readiness, then
 * unresolved issues — rather than being a static prompt.
 */
export default async function DashboardPage() {
  const actor = await requireActor()
  if (actor.isLender) redirect('/lender')
  if (actor.isAdmin) redirect('/admin')
  if (actor.isInvestor) redirect('/investments')
  // The portfolio dashboard reports on debt raised. Without the debt
  // marketplace it has nothing to say that the raises list does not say better.
  if (!debtMarketplaceEnabled()) redirect('/deals')

  const store = await db()
  const deals = await store.select('deals', {
    where: { company_id: actor.company.id },
    orderBy: { field: 'updated_at', dir: 'desc' },
  })

  const analytics = await borrowerAnalytics(actor.company.id)

  const rows = await Promise.all(
    deals.map(async (deal) => {
      const [snapshot, readiness, matches, indications, openIssues] = await Promise.all([
        buildSnapshot(deal.id),
        readinessFor(deal.id),
        store.count('matches', { where: { deal_id: deal.id, hard_fail: false } }),
        store.count('indications', { where: { deal_id: deal.id, status: { in: ['submitted', 'updated', 'selected'] } } }),
        store.count('discrepancies', { where: { deal_id: deal.id, status: 'open' } }),
      ])
      return { deal, snapshot, readiness, matches, indications, openIssues }
    }),
  )

  const nextAction = deriveNextAction(rows)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{actor.company.name}</p>
          <h1 className="mt-1 text-[20px] font-semibold text-ink">Portfolio overview</h1>
        </div>
        <Link href="/deals/new">
          <Button variant="primary" className="gap-1.5">
            <Plus className="size-4" /> New deal
          </Button>
        </Link>
      </div>

      {nextAction}

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Active deals" value={analytics.activeDeals} detail={`${deals.length} total`} />
          <MetricTile label="Capital requested" value={formatCurrency(analytics.capitalRequested, { compact: true })} />
          <MetricTile
            label="Lender matches"
            value={analytics.totalMatches}
            detail={`${analytics.averageMatchesPerDeal} average per deal`}
          />
          <MetricTile label="Indications received" value={analytics.indicationsReceived} />
          <MetricTile
            label="Deals closed"
            value={analytics.dealsClosed}
            detail={analytics.capitalFunded ? `${formatCurrency(analytics.capitalFunded, { compact: true })} funded` : undefined}
          />
          <MetricTile
            label="Days to first indication"
            value={analytics.medianDaysToFirstIndication ?? '—'}
            detail="Median across distributed deals"
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deals</CardTitle>
          <Link href="/deals" className="text-[12px] text-accent hover:underline">View all</Link>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            title="No deals yet"
            description="Create your first financing opportunity. You can start with only the facility and the amount you need — the readiness checklist will tell you what to add next."
            action={<Link href="/deals/new"><Button variant="primary">Create a deal</Button></Link>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Deal</Th>
                <Th>Facility</Th>
                <Th>Transaction</Th>
                <Th numeric>Loan request</Th>
                <Th numeric>LTV</Th>
                <Th numeric>DSCR</Th>
                <Th>Status</Th>
                <Th numeric>Matches</Th>
                <Th numeric>Offers</Th>
                <Th numeric>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map(({ deal, snapshot, matches, indications }) => (
                <Tr key={deal.id}>
                  <Td>
                    <Link href={`/deals/${deal.id}`} className="font-medium text-accent hover:underline">
                      {deal.reference}
                    </Link>
                  </Td>
                  <Td className="max-w-56 truncate">
                    <Link href={`/deals/${deal.id}`} className="text-ink hover:underline">
                      {snapshot?.facility?.name ?? deal.name}
                    </Link>
                    <span className="ml-1.5 text-ink-muted">{snapshot?.facility?.state}</span>
                  </Td>
                  <Td className="capitalize text-ink-secondary">{deal.transaction_type.replace(/_/g, ' ')}</Td>
                  <Td numeric>{formatCurrency(snapshot?.summary.loanAmount ?? null, { compact: true })}</Td>
                  <Td numeric>{formatPercent(snapshot?.summary.ltv ?? null)}</Td>
                  <Td numeric>{formatRatio(snapshot?.summary.dscr ?? null)}</Td>
                  <Td><DealStatusBadge status={deal.status} /></Td>
                  <Td numeric>{matches || '—'}</Td>
                  <Td numeric>{indications || '—'}</Td>
                  <Td numeric className="whitespace-nowrap text-ink-muted">{formatRelative(deal.updated_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

type Row = {
  deal: { id: string; name: string; reference: string; status: string }
  readiness: { canDistribute: boolean; overall: number; blockingReason: string | null; requiredOutstanding: { label: string; href: string | null }[] } | null
  matches: number
  indications: number
  openIssues: number
}

/**
 * Picks the single most valuable thing to do next across the portfolio, in
 * priority order: decide on offers, resolve blocking issues, distribute a ready
 * deal, then finish an incomplete one.
 */
function deriveNextAction(rows: Row[]): React.ReactNode {
  if (rows.length === 0) {
    return (
      <NextAction
        headline="Create your first financing opportunity"
        detail="Start with the facility and the amount you need. Everything else can follow."
        action={{ href: '/deals/new', label: 'New deal' }}
      />
    )
  }

  const withOffers = rows.filter((row) => row.indications > 0)
  if (withOffers.length) {
    const total = withOffers.reduce((sum, row) => sum + row.indications, 0)
    return (
      <NextAction
        tone="positive"
        headline={`${total} financing indication${total === 1 ? '' : 's'} awaiting your review`}
        detail={`Across ${withOffers.length} deal${withOffers.length === 1 ? '' : 's'}. Compare them side by side against the priority you have set.`}
        action={{ href: `/deals/${withOffers[0]!.deal.id}/indications`, label: 'Compare indications' }}
      />
    )
  }

  const blocked = rows.filter((row) => row.openIssues > 0 && !row.readiness?.canDistribute)
  if (blocked.length) {
    const first = blocked[0]!
    return (
      <NextAction
        tone="warning"
        headline={`${first.openIssues} item${first.openIssues === 1 ? '' : 's'} need attention on ${first.deal.name}`}
        detail="Resolving these before distribution avoids the questions coming back from every lender individually."
        action={{ href: `/deals/${first.deal.id}/issues`, label: 'Review issues' }}
      />
    )
  }

  const ready = rows.filter((row) => row.readiness?.canDistribute && row.matches > 0)
  if (ready.length) {
    const first = ready[0]!
    return (
      <NextAction
        tone="positive"
        headline={`${first.deal.name} is ready for lenders`}
        detail={`${first.matches} lender${first.matches === 1 ? '' : 's'} match this opportunity based on their stated criteria.`}
        action={{ href: `/deals/${first.deal.id}/distribute`, label: 'Distribute deal' }}
        secondary={{ href: `/deals/${first.deal.id}/memo`, label: 'Review credit memo' }}
      />
    )
  }

  const incomplete = rows
    .filter((row) => row.readiness && !row.readiness.canDistribute)
    .sort((a, b) => (b.readiness?.overall ?? 0) - (a.readiness?.overall ?? 0))[0]

  if (incomplete?.readiness) {
    return (
      <NextAction
        headline={`${incomplete.deal.name} is ${incomplete.readiness.overall}% complete`}
        detail={incomplete.readiness.blockingReason ?? undefined}
        items={incomplete.readiness.requiredOutstanding.slice(0, 4).map((item) => ({
          label: item.label,
          href: item.href,
        }))}
        action={{ href: `/deals/${incomplete.deal.id}`, label: 'Open deal' }}
      />
    )
  }

  return (
    <NextAction
      tone="positive"
      headline="Nothing needs your attention right now"
      detail="Every deal is either complete or waiting on a lender."
      action={{ href: '/deals', label: 'View deals' }}
    />
  )
}
