import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Stat,
} from '@/components/ui/primitives'
import { portfolioFor } from '@/services/equity/portfolio'
import { matchesForInvestor } from '@/services/equity/matching'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

/**
 * The investor's home.
 *
 * Answers "what should I do next" the way the borrower dashboard does: what
 * you hold, what has been paid, what needs your attention, and what is open
 * that fits what you said you look for.
 */
export default async function InvestorDashboard() {
  const actor = await requireActor()
  if (!actor.investor) redirect('/investor/onboarding')
  if (actor.investor.onboarding_stage !== 'complete') redirect('/investor/onboarding')

  const [portfolio, matches, store] = await Promise.all([
    portfolioFor(actor),
    matchesForInvestor(actor.investor.id),
    db(),
  ])

  const verifications = await store.select('investor_verifications', {
    where: { investor_id: actor.investor.id },
  })
  const outstanding = verifications.filter((v) => v.status !== 'verified')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={actor.company.name}
        title="Portfolio overview"
        description="Contributed capital and distributions received are actual figures. Estimated value is the sponsor's current opinion."
      />

      {outstanding.length > 0 ? (
        <Alert tone="warning" title="Verification outstanding">
          {outstanding.map((v) => v.kind).join(', ')} {outstanding.length === 1 ? 'is' : 'are'} not
          yet verified. Offerings that require verification will remain closed to you until{' '}
          {outstanding.length === 1 ? 'it is' : 'they are'} complete.{' '}
          <Link href="/investor/profile" className="font-medium text-accent hover:underline">
            Review your profile
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capital invested" value={formatCurrency(portfolio.capitalInvested)} hint="Actual" />
        <Stat label="Distributions received" value={formatCurrency(portfolio.distributionsReceived)} hint="Actual" />
        <Stat label="Estimated value" value={formatCurrency(portfolio.estimatedValue)} hint="Sponsor estimate" />
        <Stat label="Active investments" value={String(portfolio.activeCount)} hint={`${portfolio.pendingCount} pending`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your holdings</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {portfolio.positions.length === 0 ? (
              <p className="text-[13px] text-ink-muted">
                You do not hold any investments yet.{' '}
                <Link href="/investments" className="font-medium text-accent hover:underline">
                  Browse opportunities
                </Link>
              </p>
            ) : (
              portfolio.positions.map((row) => (
                <Link
                  key={row.position.id}
                  href={`/investments/${row.offering.id}`}
                  className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2.5 hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{row.offering.name}</div>
                    <div className="text-[11px] text-ink-muted">
                      {formatCurrency(row.position.invested_amount)} invested ·{' '}
                      {formatCurrency(row.distributionsReceived)} received
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-medium tabular-nums text-ink">
                      {formatRatio(row.realizedMultiple)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">Realised</div>
                  </div>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Consistent with your preferences</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {matches.length === 0 ? (
              <EmptyState
                title="Nothing open that fits yet"
                description="When an offering matching your stated preferences is published, it will appear here."
              />
            ) : (
              matches.slice(0, 5).map(({ match, offering }) => (
                <Link
                  key={match.id}
                  href={`/investments/${offering.id}`}
                  className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2.5 hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{offering.name}</div>
                    <div className="truncate text-[11px] text-ink-muted">
                      {match.reasons[0] ?? 'Open for investment'}
                    </div>
                  </div>
                  <div className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{match.score}%</div>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {portfolio.estimatedIrrPct !== null ? (
        <Card>
          <CardHeader><CardTitle>Portfolio return</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Estimated IRR" value={formatPercent(portfolio.estimatedIrrPct)} hint="Includes estimated value" />
              <Stat label="Realised multiple" value={formatRatio(portfolio.realizedMultiple)} hint="Cash received only" />
              <Stat label="Capital committed" value={formatCurrency(portfolio.capitalCommitted)} hint="Awaiting acceptance" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Estimated return uses the sponsor&rsquo;s current estimate of value as a closing cash
              flow. It is not a realised result, and the estimate is not independently verified.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
