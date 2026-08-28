import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatDate, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Stat, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { portfolioFor } from '@/services/equity/portfolio'
import { updatesForInvestor } from '@/services/equity/updates'
import { assetNoun } from '@/lib/deal/display'
import { BarChart, DonutChart } from '@/components/charts'

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

  const [portfolio, updates] = await Promise.all([
    portfolioFor(actor),
    updatesForInvestor(actor.investor.id),
  ])

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
            <Table minWidth="min-w-[48rem]">
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

      {portfolio.positions.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Invested against distributions received</CardTitle></CardHeader>
            <CardBody>
              <BarChart
                series={portfolio.positions.map((row) => ({
                  label: row.offering.name.split(' ').slice(0, 2).join(' '),
                  value: row.position.invested_amount,
                }))}
                format={(value) => formatCurrency(value, { compact: true })}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                Capital contributed per investment. Both figures on this page are actual amounts,
                not estimates.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Estimated value against cost</CardTitle></CardHeader>
            <CardBody>
              <DonutChart
                segments={[
                  { label: 'Capital invested', value: portfolio.capitalInvested },
                  { label: 'Distributions received', value: portfolio.distributionsReceived },
                ]}
                centerLabel="Estimated value"
                centerValue={formatCurrency(portfolio.estimatedValue, { compact: true })}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                The centre figure is the sponsor&rsquo;s current estimate of what these positions
                are worth. It is an opinion, not a valuation, and it is not independently verified.
                The segments are amounts that actually moved.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {updates.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Sponsor updates</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {updates.slice(0, 6).map((update) => (
              <div key={update.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-ink">{update.title}</h4>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {update.published_at ? formatDate(update.published_at) : ''}
                  </span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-secondary">
                  {update.body}
                </pre>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {portfolio.positions.some((p) => p.distributions.length > 0) ? (
        <Card>
          <CardBody className="flex flex-wrap items-baseline justify-between gap-3">
            <span>
              <span className="block text-[13px] font-medium text-ink">
                {formatCurrency(portfolio.distributionsReceived)} has been paid out to you
              </span>
              <span className="block text-[12px] text-ink-muted">
                Every payment, split into return of capital, preferred return and profit share.
              </span>
            </span>
            <Link href="/investor/distributions" className="text-[13px] font-medium text-accent hover:underline">
              See distributions
            </Link>
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
