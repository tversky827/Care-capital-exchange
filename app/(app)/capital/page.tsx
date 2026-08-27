import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { assetNoun } from '@/lib/deal/display'
import { formatCurrency, formatPercent, titleize } from '@/lib/utils/format'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Stat,
} from '@/components/ui/primitives'
import { capitalRequirement } from '@/services/equity/capital-stack'
import { matchCountsForOffering } from '@/services/equity/matching'
import type { Deal, Facility } from '@/types'
import type { Offering } from '@/types/equity'
import { requireDebtMarketplace } from '@/lib/product'

export const dynamic = 'force-dynamic'

interface Row {
  deal: Deal
  facility: Facility | null
  requirement: Awaited<ReturnType<typeof capitalRequirement>>
  offerings: Offering[]
  investorMatches: number
}

/**
 * Capital across every deal.
 *
 * The sponsor's version of the marketplace: how much each transaction still
 * needs and where it might come from, both halves in one place. Without this
 * the equity side was only reachable from inside a single deal, which meant an
 * operator raising on three deals had no way to see the three together.
 */
export default async function CapitalPage() {
  requireDebtMarketplace()
  const actor = await requireActor()
  if (actor.isInvestor) redirect('/investor/dashboard')
  if (actor.isLender) redirect('/lender')

  const store = await db()
  const deals = await store.select('deals', {
    where: { company_id: actor.company.id, deleted_at: { isNull: true } },
    orderBy: { field: 'created_at', dir: 'desc' },
  })

  const rows: Row[] = []
  for (const deal of deals) {
    const [facility, requirement, offerings] = await Promise.all([
      store.selectOne('facilities', { where: { deal_id: deal.id } }),
      capitalRequirement(deal.id),
      store.select('offerings', { where: { deal_id: deal.id } }),
    ])
    let investorMatches = 0
    for (const offering of offerings) {
      investorMatches += (await matchCountsForOffering(offering.id)).total
    }
    rows.push({ deal, facility, requirement, offerings, investorMatches })
  }

  const totalDebt = rows.reduce((sum, r) => sum + (r.requirement.debtRequired ?? 0), 0)
  const totalEquity = rows.reduce((sum, r) => sum + (r.requirement.equityRequired ?? 0), 0)
  const committed = rows.reduce((sum, r) => sum + (r.requirement.equityCommitted ?? 0), 0)
  const liveOfferings = rows.reduce((sum, r) => sum + r.offerings.filter((o) => o.status === 'live').length, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Capital markets"
        title="Debt and equity across your deals"
        description="What each transaction still needs, and where it might come from. Debt figures come from indications lenders have made; equity from commitments you have accepted."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No deals yet"
          description="Create a deal and its capital requirement will appear here."
          action={<Link href="/deals/new" className="text-[13px] font-medium text-accent hover:underline">Create a deal</Link>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Debt sought" value={formatCurrency(totalDebt, { compact: true })} hint={`${rows.length} deals`} />
            <Stat label="Equity required" value={formatCurrency(totalEquity, { compact: true })} />
            <Stat label="Equity committed" value={formatCurrency(committed, { compact: true })} />
            <Stat label="Live offerings" value={String(liveOfferings)} hint={`${rows.reduce((s, r) => s + r.offerings.length, 0)} in total`} />
          </div>

          {isAvailable('EQUITY_MARKETPLACE_ENABLED') && liveOfferings === 0 ? (
            <Alert tone="neutral" title="You can raise equity here too">
              Alongside debt, a deal can raise equity from investors on the platform. Open any deal
              and choose <strong>Equity</strong> to create an offering — it becomes visible to
              investors only after an administrator reviews and publishes it.
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.deal.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      <Link href={`/deals/${row.deal.id}/capital`} className="text-accent hover:underline">
                        {row.facility?.name ?? row.deal.name}
                      </Link>
                    </CardTitle>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {row.deal.reference} · {titleize(row.deal.transaction_type)} ·{' '}
                      {assetNoun(row.deal.asset_type)}
                    </p>
                  </div>
                  <Badge tone={row.deal.status === 'funded' ? 'positive' : 'neutral'}>
                    {titleize(row.deal.status)}
                  </Badge>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Total" value={formatCurrency(row.requirement.totalCost, { compact: true })} />
                    <Stat label="Debt" value={formatCurrency(row.requirement.debtRequired, { compact: true })} />
                    <Stat label="Equity" value={formatCurrency(row.requirement.equityRequired, { compact: true })} />
                  </div>

                  <Progress label="Debt" value={row.requirement.debtProgress} />
                  <Progress label="Equity" value={row.requirement.equityProgress} />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <span className="text-[11px] text-ink-muted">
                      {row.offerings.length === 0
                        ? 'No equity offering'
                        : `${row.offerings.length} offering${row.offerings.length === 1 ? '' : 's'} · ${row.investorMatches} investor${row.investorMatches === 1 ? '' : 's'} matched`}
                    </span>
                    <span className="flex gap-2">
                      <Link href={`/deals/${row.deal.id}/capital`}>
                        <Button size="sm">Capital stack</Button>
                      </Link>
                      <Link href={row.offerings.length > 0 ? `/deals/${row.deal.id}/equity` : `/deals/${row.deal.id}/equity/new`}>
                        <Button size="sm" variant={row.offerings.length > 0 ? 'secondary' : 'primary'}>
                          {row.offerings.length > 0 ? 'Manage the raise' : 'Raise equity'}
                        </Button>
                      </Link>
                    </span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Progress({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>{label}</span>
        <span className="tabular-nums">{value !== null ? formatPercent(value * 100) : 'Not yet raised'}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  )
}
