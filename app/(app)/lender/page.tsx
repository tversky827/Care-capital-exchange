import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { pipelineForLender } from '@/services/distribution'
import { lenderAnalytics } from '@/services/analytics'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { displayName } from '@/lib/deal/display'
import { subjectOf } from '@/lib/access'
import { canViewDealIdentity } from '@/lib/policy'
import {
  Alert, Badge, Button, Card, CardHeader, CardTitle, EmptyState, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { MetricTile, NextAction } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRatio, formatRelative, titleize } from '@/lib/utils/format'
import { requireDebtMarketplace } from '@/lib/product'

export const metadata: Metadata = { title: 'Lender dashboard' }

/**
 * Lender dashboard.
 *
 * Leads with what needs a decision: opportunities shared but not yet opened,
 * then those under review. Everything a lender sees here is scoped by their own
 * distributions — there is no route from this page to a deal they were not sent.
 */
export default async function LenderDashboard() {
  requireDebtMarketplace()
  const actor = await requireActor()
  if (!actor.isLender) redirect(actor.isAdmin ? '/admin' : '/dashboard')

  const lender = actor.lender
  if (!lender) {
    return (
      <Card>
        <EmptyState
          title="No lender profile on this organisation"
          description="Contact a platform administrator to have your institution set up."
        />
      </Card>
    )
  }

  if (lender.verification_status !== 'verified') {
    return (
      <div className="space-y-4">
        <Alert
          tone={lender.verification_status === 'rejected' ? 'critical' : 'warning'}
          title={`Your institution is ${lender.verification_status}`}
        >
          {lender.verification_status === 'pending'
            ? 'A platform administrator reviews every lending institution before it receives borrower opportunities. Until verification completes, no deal, document or borrower identity is visible to you.'
            : 'Contact a platform administrator for details.'}
        </Alert>
        <NextAction
          headline="Define your lending box while you wait"
          detail="Your published criteria drive matching, so having them in place means opportunities start flowing the moment verification completes."
          action={{ href: '/lender/box', label: 'Set lending criteria' }}
        />
      </div>
    )
  }

  const store = await db()
  const [distributions, analytics, box] = await Promise.all([
    pipelineForLender(lender.id),
    lenderAnalytics(lender.id),
    store.selectOne('lender_lending_boxes', { where: { lender_id: lender.id } }),
  ])

  const rows = await Promise.all(
    distributions
      .filter((entry) => entry.status !== 'revoked')
      .map(async (distribution) => {
        const snapshot = await buildSnapshot(distribution.deal_id)
        const match = await store.selectOne('matches', {
          where: { deal_id: distribution.deal_id, lender_id: lender.id },
        })
        const indication = await store.selectOne('indications', {
          where: { deal_id: distribution.deal_id, lender_id: lender.id, status: { in: ['submitted', 'updated', 'selected'] } },
        })
        return { distribution, snapshot, match, indication }
      }),
  )

  const unopened = rows.filter((row) => row.distribution.view_count === 0)
  const reviewing = rows.filter((row) => row.distribution.pipeline_stage === 'reviewing')
  const subject = subjectOf(actor)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{lender.institution_name}</p>
          <h1 className="mt-1 text-[20px] font-semibold text-ink">Origination dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/marketplace"><Button>Browse marketplace</Button></Link>
          <Link href="/lender/box"><Button variant="primary">Lending box</Button></Link>
        </div>
      </div>

      {!box ? (
        <NextAction
          tone="warning"
          headline="Your lending box is not configured"
          detail="Until you publish your criteria, the platform cannot screen opportunities for you and you will see every deal rather than the ones that fit."
          action={{ href: '/lender/box', label: 'Set lending criteria' }}
        />
      ) : unopened.length > 0 ? (
        <NextAction
          tone="positive"
          headline={`${unopened.length} new opportunit${unopened.length === 1 ? 'y' : 'ies'} matching your criteria`}
          detail="Each has been screened against your published lending box before reaching you."
          action={{ href: `/lender/deals/${unopened[0]!.distribution.deal_id}`, label: 'Review first opportunity' }}
        />
      ) : reviewing.length > 0 ? (
        <NextAction
          headline={`${reviewing.length} deal${reviewing.length === 1 ? '' : 's'} under review`}
          detail="Move them forward, request information, or pass — the borrower sees engagement, not your internal notes."
          action={{ href: '/lender/pipeline', label: 'Open pipeline' }}
        />
      ) : (
        <NextAction
          tone="positive"
          headline="Nothing is waiting on you"
          detail="New opportunities matching your criteria will appear here as borrowers distribute them."
          action={{ href: '/marketplace', label: 'Browse the marketplace' }}
        />
      )}

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Opportunities received" value={analytics.dealsReceived} />
          <MetricTile label="Opened" value={analytics.dealsViewed} detail={analytics.viewRatePct !== null ? `${analytics.viewRatePct}% of those received` : undefined} />
          <MetricTile label="Pursued" value={analytics.dealsPursued} />
          <MetricTile label="Indications submitted" value={analytics.indicationsSubmitted} detail={analytics.conversionRatePct !== null ? `${analytics.conversionRatePct}% of opened` : undefined} />
          <MetricTile label="Selected" value={analytics.indicationsSelected} />
          <MetricTile label="Average loan size" value={formatCurrency(analytics.averageLoanAmount, { compact: true })} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your opportunities</CardTitle>
          <Link href="/lender/pipeline" className="text-[12px] text-accent hover:underline">Pipeline view</Link>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            title="No opportunities yet"
            description="Borrowers distribute deals to the lenders whose criteria fit. Publishing a complete lending box, and keeping your response times short, is what puts you in front of more of them."
            action={<Link href="/marketplace"><Button variant="primary">Browse the marketplace</Button></Link>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Opportunity</Th>
                <Th>State</Th>
                <Th>Transaction</Th>
                <Th numeric>Request</Th>
                <Th numeric>LTV</Th>
                <Th numeric>DSCR</Th>
                <Th numeric>Debt yield</Th>
                <Th numeric>Match</Th>
                <Th>Stage</Th>
                <Th>Your indication</Th>
                <Th numeric>Received</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ distribution, snapshot, match, indication }) => {
                if (!snapshot) return null
                const canSeeIdentity = canViewDealIdentity(subject, snapshot.deal, { distribution })
                return (
                  <Tr key={distribution.id}>
                    <Td className="max-w-64">
                      <Link href={`/lender/deals/${distribution.deal_id}`} className="block truncate font-medium text-accent hover:underline">
                        {displayName(snapshot.deal, snapshot.facility, canSeeIdentity)}
                      </Link>
                      <span className="text-[11px] text-ink-muted">
                        {snapshot.facility?.licensed_beds ? `${snapshot.facility.licensed_beds} beds · ` : ''}
                        {titleize(snapshot.deal.asset_type)}
                      </span>
                    </Td>
                    <Td>{snapshot.facility?.state ?? '—'}</Td>
                    <Td className="text-ink-secondary">{titleize(snapshot.deal.transaction_type)}</Td>
                    <Td numeric>{formatCurrency(snapshot.summary.loanAmount, { compact: true })}</Td>
                    <Td numeric>{formatPercent(snapshot.summary.ltv)}</Td>
                    <Td numeric>{formatRatio(snapshot.summary.dscr)}</Td>
                    <Td numeric>{formatPercent(snapshot.summary.debtYield)}</Td>
                    <Td numeric>
                      {match ? <Badge tone={match.score >= 85 ? 'positive' : match.score >= 70 ? 'accent' : 'warning'}>{match.score}%</Badge> : '—'}
                    </Td>
                    <Td><Badge tone="neutral">{titleize(distribution.pipeline_stage)}</Badge></Td>
                    <Td>
                      {indication ? (
                        <span className="tnum text-[12px] text-ink">
                          {formatCurrency(indication.loan_amount, { compact: true })} @ {formatPercent(indication.all_in_rate_pct, 2)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-ink-muted">Not submitted</span>
                      )}
                    </Td>
                    <Td numeric className="whitespace-nowrap text-ink-muted">{formatRelative(distribution.created_at)}</Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
