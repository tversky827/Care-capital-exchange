import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatDate, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Stat, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { portfolioFor } from '@/services/equity/portfolio'
import { assetNoun } from '@/lib/deal/display'

export const dynamic = 'force-dynamic'

/**
 * Holdings, distributions and concentration.
 *
 * The table separates what happened from what is estimated, column by column,
 * because that is the distinction an investor most needs and the one most
 * easily blurred.
 */
export default async function PortfolioPage() {
  const actor = await requireActor()
  if (!actor.investor) redirect('/investor/onboarding')

  const portfolio = await portfolioFor(actor)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Holdings"
        title="Portfolio"
        description="Invested capital and distributions received are actual. Estimated value is the sponsor's opinion and is not independently verified."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capital invested" value={formatCurrency(portfolio.capitalInvested)} hint="Actual" />
        <Stat label="Distributions received" value={formatCurrency(portfolio.distributionsReceived)} hint="Actual" />
        <Stat label="Realised multiple" value={formatRatio(portfolio.realizedMultiple)} hint="Cash only" />
        <Stat label="Estimated value" value={formatCurrency(portfolio.estimatedValue)} hint="Sponsor estimate" />
      </div>

      {portfolio.positions.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          description="Investments you complete will appear here with their distributions and documents."
          action={<Link href="/investments" className="text-[13px] font-medium text-accent hover:underline">Browse opportunities</Link>}
        />
      ) : (
        <Card>
          <CardHeader><CardTitle>Positions</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <thead>
                <Tr>
                  <Th>Investment</Th>
                  <Th>Asset</Th>
                  <Th numeric>Invested</Th>
                  <Th numeric>Received</Th>
                  <Th numeric>Realised</Th>
                  <Th numeric>Est. value</Th>
                  <Th>Since</Th>
                </Tr>
              </thead>
              <tbody>
                {portfolio.positions.map((row) => (
                  <Tr key={row.position.id}>
                    <Td>
                      <Link href={`/investments/${row.offering.id}`} className="font-medium text-accent hover:underline">
                        {row.offering.name}
                      </Link>
                    </Td>
                    <Td>{assetNoun(row.deal.asset_type)}</Td>
                    <Td numeric>{formatCurrency(row.position.invested_amount)}</Td>
                    <Td numeric>{formatCurrency(row.distributionsReceived)}</Td>
                    <Td numeric>{formatRatio(row.realizedMultiple)}</Td>
                    <Td numeric>{formatCurrency(row.position.estimated_value)}</Td>
                    <Td>{formatDate(row.position.acquired_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}

      {portfolio.positions.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Allocation title="By asset type" rows={portfolio.byAssetType} total={portfolio.capitalInvested} />
          <Allocation title="By state" rows={portfolio.byState} total={portfolio.capitalInvested} />
          <Allocation title="By sponsor" rows={portfolio.bySponsor} total={portfolio.capitalInvested} />
        </div>
      ) : null}

      {portfolio.positions.some((p) => p.distributions.length > 0) ? (
        <Card>
          <CardHeader><CardTitle>Distributions received</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <thead>
                <Tr>
                  <Th>Investment</Th>
                  <Th numeric>Amount</Th>
                  <Th numeric>Return of capital</Th>
                  <Th numeric>Preferred</Th>
                  <Th numeric>Profit share</Th>
                  <Th>Paid</Th>
                </Tr>
              </thead>
              <tbody>
                {portfolio.positions.flatMap((row) =>
                  row.distributions.map((distribution) => (
                    <Tr key={distribution.id}>
                      <Td>{row.offering.name}</Td>
                      <Td numeric>{formatCurrency(distribution.amount)}</Td>
                      <Td numeric>{formatCurrency(distribution.return_of_capital)}</Td>
                      <Td numeric>{formatCurrency(distribution.preferred_return)}</Td>
                      <Td numeric>{formatCurrency(distribution.profit_share)}</Td>
                      <Td>{distribution.processed_at ? formatDate(distribution.processed_at) : '—'}</Td>
                    </Tr>
                  )),
                )}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function Allocation({ title, rows, total }: { title: string; rows: { label: string; amount: number }[]; total: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[12px] text-ink-muted">No holdings.</p>
        ) : (
          rows.map((row) => {
            const share = total > 0 ? row.amount / total : 0
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="capitalize text-ink-secondary">{row.label.replace(/_/g, ' ')}</span>
                  <span className="tabular-nums text-ink-muted">{formatPercent(share * 100)}</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            )
          })
        )}
      </CardBody>
    </Card>
  )
}
