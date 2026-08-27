import Link from 'next/link'
import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { readinessFor } from '@/services/underwriting'
import { Button, Card, EmptyState, PageHeader, Progress, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { DealStatusBadge } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRatio, formatRelative, titleize } from '@/lib/utils/format'
import { DEAL_STATUSES, type Offering } from '@/types'
import { debtMarketplaceEnabled } from '@/lib/product'
import { offeringsForDeal } from '@/services/equity/offerings'
import { RaisesList, type RaiseRow } from './raises-list'

export const metadata: Metadata = { title: 'My raises' }

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const actor = await requireActor()
  const params = await searchParams
  const store = await db()

  const deals = await store.select('deals', {
    where: actor.isAdmin ? {} : { company_id: actor.company.id },
    orderBy: { field: 'updated_at', dir: 'desc' },
  })

  // Without the debt marketplace a "deal" is a property somebody is raising
  // against, and the thirteen-column financing table answers questions nobody
  // on this screen is asking. The raises view answers the three they are.
  if (!debtMarketplaceEnabled() && !actor.isAdmin) {
    const rows: RaiseRow[] = await Promise.all(deals.map(async (deal) => {
      const [snapshot, offerings] = await Promise.all([
        buildSnapshot(deal.id),
        offeringsForDeal(deal.id),
      ])
      // The raise a sponsor means is the one they are running now: the live one
      // if there is one, otherwise the most recently touched.
      const offering = offerings.find((o) => o.status === 'live')
        ?? [...offerings].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
        ?? null
      const [terms, investors] = await Promise.all([
        offering
          ? store.selectOne('offering_terms', { where: { offering_id: offering.id } })
          : Promise.resolve(null),
        offering
          ? store.count('investment_commitments', {
            where: { offering_id: offering.id, status: { in: ['submitted', 'accepted', 'funded'] } },
          })
          : Promise.resolve(0),
      ])
      return {
        dealId: deal.id,
        name: snapshot?.facility?.name ?? deal.name,
        location: [snapshot?.facility?.city, snapshot?.facility?.state].filter(Boolean).join(', '),
        beds: snapshot?.facility?.licensed_beds ?? null,
        offering,
        terms,
        investors,
        next: nextStep(deal.id, offering),
      }
    }))
    return <RaisesList rows={rows} companyName={actor.company.name} />
  }

  const filtered = params.status && DEAL_STATUSES.includes(params.status as never)
    ? deals.filter((deal) => deal.status === params.status)
    : deals

  const rows = await Promise.all(
    filtered.map(async (deal) => ({
      deal,
      snapshot: await buildSnapshot(deal.id),
      readiness: await readinessFor(deal.id),
      matches: await store.count('matches', { where: { deal_id: deal.id, hard_fail: false } }),
      indications: await store.count('indications', {
        where: { deal_id: deal.id, status: { in: ['submitted', 'updated', 'selected'] } },
      }),
      issues: await store.count('discrepancies', { where: { deal_id: deal.id, status: 'open' } }),
    })),
  )

  // Status counts drive the filter chips, so a status with no deals is not offered.
  const counts = new Map<string, number>()
  for (const deal of deals) counts.set(deal.status, (counts.get(deal.status) ?? 0) + 1)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={actor.isAdmin ? 'All organisations' : actor.company.name}
        title="Deals"
        description={`${deals.length} financing ${deals.length === 1 ? 'opportunity' : 'opportunities'}.`}
        actions={
          !actor.isAdmin ? (
            <Link href="/deals/new">
              <Button variant="primary" className="gap-1.5"><Plus className="size-4" /> New deal</Button>
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/deals" label="All" count={deals.length} active={!params.status} />
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => (
            <FilterChip
              key={status}
              href={`/deals?status=${status}`}
              label={titleize(status)}
              count={count}
              active={params.status === status}
            />
          ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={params.status ? 'No deals with that status' : 'No deals yet'}
            description={
              params.status
                ? 'Clear the filter to see every deal.'
                : 'Create your first financing opportunity — you can start with only the facility and the amount you need.'
            }
            action={
              params.status ? (
                <Link href="/deals"><Button>Clear filter</Button></Link>
              ) : (
                <Link href="/deals/new"><Button variant="primary">Create a deal</Button></Link>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Facility</Th>
                <Th>Transaction</Th>
                <Th numeric>Request</Th>
                <Th numeric>LTV</Th>
                <Th numeric>DSCR</Th>
                <Th numeric>Debt yield</Th>
                <Th>Status</Th>
                <Th className="w-32">Readiness</Th>
                <Th numeric>Matches</Th>
                <Th numeric>Offers</Th>
                <Th numeric>Issues</Th>
                <Th numeric>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal, snapshot, readiness, matches, indications, issues }) => (
                <Tr key={deal.id}>
                  <Td>
                    <Link href={`/deals/${deal.id}`} className="font-medium text-accent hover:underline">
                      {deal.reference}
                    </Link>
                  </Td>
                  <Td className="max-w-64">
                    <Link href={`/deals/${deal.id}`} className="block truncate text-ink hover:underline">
                      {snapshot?.facility?.name ?? deal.name}
                    </Link>
                    <span className="text-[11px] text-ink-muted">
                      {[snapshot?.facility?.city, snapshot?.facility?.state].filter(Boolean).join(', ')}
                      {snapshot?.facility?.licensed_beds ? ` · ${snapshot.facility.licensed_beds} beds` : ''}
                    </span>
                  </Td>
                  <Td className="text-ink-secondary">{titleize(deal.transaction_type)}</Td>
                  <Td numeric>{formatCurrency(snapshot?.summary.loanAmount ?? null, { compact: true })}</Td>
                  <Td numeric>{formatPercent(snapshot?.summary.ltv ?? null)}</Td>
                  <Td numeric>{formatRatio(snapshot?.summary.dscr ?? null)}</Td>
                  <Td numeric>{formatPercent(snapshot?.summary.debtYield ?? null)}</Td>
                  <Td><DealStatusBadge status={deal.status} /></Td>
                  <Td>
                    <Progress
                      value={readiness?.overall ?? 0}
                      tone={readiness?.canDistribute ? 'positive' : (readiness?.overall ?? 0) >= 60 ? 'warning' : 'critical'}
                      showLabel
                    />
                  </Td>
                  <Td numeric>{matches || '—'}</Td>
                  <Td numeric>{indications || '—'}</Td>
                  <Td numeric className={issues ? 'font-medium text-warning' : 'text-ink-muted'}>
                    {issues || '—'}
                  </Td>
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

function FilterChip({
  href, label, count, active,
}: {
  href: string
  label: string
  count: number
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 border px-2.5 py-1 text-[12px] transition-colors rounded-[3px] ${
        active
          ? 'border-accent bg-accent-soft font-medium text-accent'
          : 'border-line bg-surface text-ink-secondary hover:bg-surface-sunken'
      }`}
    >
      {label}
      <span className="tnum text-ink-muted">{count}</span>
    </Link>
  )
}

/**
 * The one thing to do next on a raise.
 *
 * A sponsor should never have to work out where they are in a workflow. Each
 * state has exactly one obvious next move, and the card offers that one.
 */
function nextStep(dealId: string, offering: Offering | null): RaiseRow['next'] {
  if (!offering) return { label: 'Start a raise', href: `/deals/${dealId}/equity/new`, primary: true }
  const raise = { label: 'Open the raise', href: `/deals/${dealId}/equity`, primary: false }
  if (offering.status === 'draft') return { ...raise, label: 'Finish the draft', primary: true }
  if (offering.status === 'ready') return { ...raise, label: 'Publish it', primary: true }
  if (offering.status === 'live') return { ...raise, label: 'See investors', primary: true }
  return raise
}
