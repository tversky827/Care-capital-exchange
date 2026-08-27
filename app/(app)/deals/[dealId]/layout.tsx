import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { loadDealForActor } from '@/lib/access'
import { ForbiddenError } from '@/lib/policy'
import { debtMarketplaceEnabled } from '@/lib/product'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { readinessFor } from '@/services/underwriting'
import { Badge, Button, Progress } from '@/components/ui/primitives'
import { DealStatusBadge } from '@/components/deal/common'
import { DealTabs } from './tabs'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'

/**
 * Deal workspace shell.
 *
 * The header is the deal's identity card: name, reference, status, the headline
 * metrics a lender screens on, and readiness. It stays on screen across every
 * tab so the numbers never have to be looked up again.
 */
export default async function DealLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ dealId: string }>
}) {
  const { dealId } = await params
  const actor = await requireActor()

  // A lender reaching a borrower deal URL belongs in the lender deal room,
  // which shows only what they are entitled to see.
  if (actor.isLender) redirect(`/lender/deals/${dealId}`)

  // When access is denied the layout renders no deal chrome at all, so nothing
  // about the deal can appear around the page's not-found boundary. The page
  // itself produces the 404 — see `requireDealAccess`.
  try {
    await loadDealForActor(actor, dealId)
  } catch (error) {
    if (error instanceof ForbiddenError) notFound()
    throw error
  }

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const debtMarketplace = debtMarketplaceEnabled()
  const readiness = await readinessFor(dealId)

  const store = await db()
  const [openIssues, matchCount, indicationCount, unreadThreads, offeringCount] = await Promise.all([
    store.count('discrepancies', { where: { deal_id: dealId, status: 'open' } }),
    store.count('matches', { where: { deal_id: dealId, hard_fail: false } }),
    store.count('indications', { where: { deal_id: dealId, status: { in: ['submitted', 'updated', 'selected'] } } }),
    store.count('message_threads', { where: { deal_id: dealId, status: 'open' } }),
    store.count('offerings', { where: { deal_id: dealId } }),
  ])

  const { deal, facility, summary } = snapshot

  return (
    <div className="space-y-4">
      <div className="border border-line bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/deals" className="text-[12px] text-ink-muted hover:text-ink">
                {debtMarketplace ? 'Deals' : 'My raises'}
              </Link>
              <span className="text-[12px] text-ink-muted">/</span>
              <span className="tnum text-[12px] font-medium text-ink-secondary">{deal.reference}</span>
              {deal.is_demo ? <Badge tone="warning">Demo</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-[19px] font-semibold text-ink">
              {facility?.name ?? deal.name}
            </h1>
            <p className="mt-0.5 text-[12px] text-ink-secondary">
              {titleize(deal.transaction_type)} · {titleize(deal.asset_type)}
              {facility?.state ? ` · ${[facility.city, facility.state].filter(Boolean).join(', ')}` : ''}
              {facility?.licensed_beds ? ` · ${facility.licensed_beds} licensed beds` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* The deal status taxonomy tracks a loan through a lender
                pipeline. Without that pipeline it says nothing true. */}
            {debtMarketplace ? <DealStatusBadge status={deal.status} /> : null}
            <Link href={`/deals/${dealId}/ask`}>
              <Button size="sm">Ask a question</Button>
            </Link>
            {debtMarketplace ? (
              <Link href={`/deals/${dealId}/distribute`}>
                <Button size="sm" variant="primary">
                  {deal.distributed_at ? 'Manage distribution' : 'Distribute'}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <dl className="data-grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          {debtMarketplace ? (
            <>
              <HeaderMetric label="Requested" value={formatCurrency(summary.loanAmount, { compact: true })} />
              <HeaderMetric label="LTV" value={formatPercent(summary.ltv)} />
              <HeaderMetric label="DSCR" value={formatRatio(summary.dscr)} />
              <HeaderMetric label="Debt yield" value={formatPercent(summary.debtYield)} />
              <HeaderMetric label="Underwritten NOI" value={formatCurrency(summary.noi, { compact: true })} />
            </>
          ) : (
            <>
              {/* What a sponsor raising equity is actually working with. Debt
                  yield is a lender's screening ratio and means nothing here.
                  The sources-and-uses equity gap is deliberately not shown:
                  on a cash-out refinance it is legitimately zero while the
                  raise beneath it is for millions, and the two figures
                  side by side read as a contradiction rather than as the two
                  different questions they answer. */}
              <HeaderMetric label="Total cost" value={formatCurrency(summary.totalCost, { compact: true })} />
              <HeaderMetric label="Senior debt" value={formatCurrency(summary.loanAmount, { compact: true })} />
              <HeaderMetric label="Value" value={formatCurrency(summary.valueBasis, { compact: true })} />
              <HeaderMetric label="Yearly profit" value={formatCurrency(summary.noi, { compact: true })} />
              <HeaderMetric label="Covers debt by" value={formatRatio(summary.dscr)} />
            </>
          )}
          <div className="px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">Readiness</dt>
            <dd className="mt-1.5">
              <Progress
                value={readiness?.overall ?? 0}
                tone={readiness?.canDistribute ? 'positive' : (readiness?.overall ?? 0) >= 60 ? 'warning' : 'critical'}
                showLabel
              />
            </dd>
          </div>
        </dl>
      </div>

      <DealTabs
        dealId={dealId}
        debtMarketplace={debtMarketplace}
        counts={{
          issues: openIssues,
          matches: matchCount,
          indications: indicationCount,
          messages: unreadThreads,
          documents: snapshot.documents.length,
          offerings: offeringCount,
        }}
      />

      {children}
    </div>
  )
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  )
}
