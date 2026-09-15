import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils/format'
import { Card, CardBody, EmptyState } from '@/components/ui/primitives'
import { Fold } from '@/app/(app)/investments/[offeringId]/disclose'
import { portfolioFor } from '@/services/equity/portfolio'
import { updatesForInvestor } from '@/services/equity/updates'
import { DonutChart } from '@/components/charts'

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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ---- one number ---------------------------------------------------
          The sponsor's estimate, because that is what "what is my portfolio
          worth" means — and it is labelled as an estimate on the line below
          rather than in a caption under a stat box nobody reads. */}
      <div>
        <p className="text-[12px] text-ink-muted">Portfolio</p>
        <p className="tnum mt-1 text-[42px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[52px]">
          {formatCurrency(portfolio.estimatedValue)}
        </p>
        <p className="mt-2 text-[13px] text-ink-secondary">
          {portfolio.positions.length === 0
            ? 'Nothing held yet.'
            : [
              `${formatCurrency(portfolio.capitalInvested)} invested`,
              portfolio.distributionsReceived > 0
                ? `${formatCurrency(portfolio.distributionsReceived)} paid out`
                : null,
            ].filter(Boolean).join('  ·  ')}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
          Invested capital and distributions are amounts that moved. The figure above is the
          operator&rsquo;s own estimate of what the holdings are worth — an opinion, not a
          valuation, and not independently verified.
        </p>
      </div>

      {portfolio.positions.length === 0 ? (
        <EmptyState
          title="No investments yet"
          description="What you invest in appears here, with what it has paid you."
          action={<Link href="/investments" className="text-[13px] font-medium text-accent hover:underline">Find an investment</Link>}
        />
      ) : (
        <>
          {/* ---- what you own --------------------------------------------- */}
          <div>
            <Label>Investments</Label>
            <Card className="overflow-hidden">
              {portfolio.positions.map(({ position, offering, distributions }) => {
                const paid = distributions.reduce((total, row) => total + row.amount, 0)
                return (
                  <Link
                    key={position.id}
                    href={`/investments/${position.offering_id}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {offering.name}
                      </span>
                      <span className="block text-[12px] text-ink-muted">
                        {formatCurrency(position.invested_amount)} invested
                        {paid > 0 ? ` · ${formatCurrency(paid)} paid out` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[14px] font-medium text-ink">
                        {formatCurrency(position.estimated_value ?? position.invested_amount)}
                      </span>
                      <span className="block text-[11px] text-ink-muted">estimated</span>
                    </span>
                  </Link>
                )
              })}
            </Card>
          </div>

          {portfolio.distributionsReceived > 0 ? (
            <Link
              href="/investor/distributions"
              className="flex items-center justify-between gap-3 border border-line bg-surface px-4 py-3.5 hover:bg-surface-sunken"
            >
              <span>
                <span className="block text-[14px] font-medium text-ink">
                  {formatCurrency(portfolio.distributionsReceived)} paid out to you
                </span>
                <span className="block text-[12px] text-ink-muted">
                  Split into return of capital, preferred return and profit share
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-accent">See all</span>
            </Link>
          ) : null}

          {/* ---- everything else, folded ----------------------------------- */}
          <Fold title="How it is spread">
            <CardBody className="space-y-4">
              <Allocation title="By state" rows={portfolio.byState} total={portfolio.capitalInvested} />
              <Allocation title="By operator" rows={portfolio.bySponsor} total={portfolio.capitalInvested} />
              <Allocation title="By asset type" rows={portfolio.byAssetType} total={portfolio.capitalInvested} />
            </CardBody>
          </Fold>

          <Fold title="Estimated value against what you put in">
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
                The centre figure is the operator&rsquo;s current estimate. The segments are amounts
                that actually moved.
              </p>
            </CardBody>
          </Fold>

          {updates.length > 0 ? (
            <Fold title="Updates from operators" meta={`${updates.length}`}>
              <CardBody className="space-y-4">
                {updates.slice(0, 5).map((update) => (
                  <div key={update.id} className="border-b border-line pb-3.5 last:border-b-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-semibold text-ink">{update.title}</p>
                      <p className="shrink-0 text-[11px] text-ink-muted">{formatDate(update.published_at)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-ink-secondary">
                      {update.body}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Fold>
          ) : null}
        </>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
      {children}
    </p>
  )
}

/** One concentration breakdown. Inside a fold now, so it needs no card of its own. */
function Allocation({ title, rows, total }: { title: string; rows: { label: string; amount: number }[]; total: number }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-ink">{title}</p>
      <div className="space-y-2">
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
      </div>
    </div>
  )
}
