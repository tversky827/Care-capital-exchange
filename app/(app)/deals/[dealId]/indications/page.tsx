import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canSelectIndication } from '@/lib/policy'
import { compareIndications, priorityLabel } from '@/services/indications'
import { buildSnapshot } from '@/lib/deal/snapshot'
import {
  Alert, Badge, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { SelectIndication } from './select-indication'
import { formatCurrency, formatDate, formatPercent, formatRatio, titleize } from '@/lib/utils/format'

/**
 * Offer comparison.
 *
 * The ranking is explicitly a comparison against the borrower's own stated
 * priority, not advice. Effective cost is solved from the actual cash flows, so
 * a low coupon with heavy fees does not read as cheaper than it is.
 */
export default async function IndicationsPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [comparisons, snapshot] = await Promise.all([compareIndications(dealId), buildSnapshot(dealId)])
  const canSelect = canSelectIndication(subjectOf(actor), deal)
  const selected = comparisons.find((row) => row.indication.status === 'selected')

  if (comparisons.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No financing indications yet"
          description="Once the deal is distributed, lenders submit indications here in a single standard format — amount, rate, term, amortization, interest-only, fees, prepayment, recourse, covenants and conditions — so they can be compared like for like."
        />
      </Card>
    )
  }

  const best = comparisons[0]!

  return (
    <div className="space-y-4">
      <Alert tone={selected ? 'positive' : 'accent'} title={selected ? 'Preferred indication selected' : `Ranked by your stated priority: ${priorityLabel(deal.borrower_priority)}`}>
        {selected ? (
          <>
            You selected {selected.lender.institution_name}. The deal has moved to diligence and the
            other lenders have been notified that their indications were not selected.
          </>
        ) : (
          <>
            Based on your selected priority of {priorityLabel(deal.borrower_priority)},{' '}
            <strong>{best.lender.institution_name}</strong> ranks highest. This is a comparison tool,
            not financial advice — every indication is an indication of interest, not a commitment to
            lend, and the terms are subject to each lender&apos;s own credit process.
          </>
        )}
      </Alert>

      <Section
        title="Comparison"
        description="Effective cost is the internal rate of return of the actual cash flows, so origination and exit fees are priced in rather than ignored."
      >
        <Table>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th>Lender</Th>
              <Th numeric>Loan amount</Th>
              <Th numeric>Rate</Th>
              <Th numeric>Effective cost</Th>
              <Th numeric>Term</Th>
              <Th numeric>Amort.</Th>
              <Th numeric>IO</Th>
              <Th numeric>Fees</Th>
              <Th>Recourse</Th>
              <Th numeric>Monthly payment</Th>
              <Th numeric>Annual debt service</Th>
              <Th numeric>DSCR</Th>
              <Th numeric>Close</Th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((row) => (
              <Tr key={row.indication.id} className={row.indication.status === 'selected' ? 'bg-positive-soft/50' : undefined}>
                <Td>
                  <Badge tone={row.rank === 1 ? 'positive' : 'neutral'}>{row.rank}</Badge>
                </Td>
                <Td className="font-medium text-ink">
                  {row.lender.institution_name}
                  {row.indication.is_commitment ? (
                    <Badge tone="positive" className="ml-1.5">Commitment</Badge>
                  ) : null}
                  {row.indication.status === 'selected' ? <Badge tone="positive" className="ml-1.5">Selected</Badge> : null}
                </Td>
                <Td numeric>{formatCurrency(row.indication.loan_amount, { compact: true })}</Td>
                <Td numeric>
                  {formatPercent(row.indication.all_in_rate_pct, 2)}
                  {row.indication.rate_type === 'floating' ? (
                    <span className="block text-[10px] text-ink-muted">
                      {row.indication.index_name} + {row.indication.spread_pct}%
                    </span>
                  ) : null}
                </Td>
                <Td numeric className="font-semibold">{formatPercent(row.cost.effectiveRatePct, 2)}</Td>
                <Td numeric>{Math.round(row.indication.term_months / 12)}y</Td>
                <Td numeric>{Math.round(row.indication.amortization_months / 12)}y</Td>
                <Td numeric>{row.indication.interest_only_months || '—'}</Td>
                <Td numeric>
                  {formatPercent(row.indication.origination_fee_pct + row.indication.exit_fee_pct, 2)}
                  <span className="block text-[10px] text-ink-muted">
                    {formatCurrency(row.cost.totalFees, { compact: true })}
                  </span>
                </Td>
                <Td className="text-ink-secondary">{titleize(row.indication.recourse)}</Td>
                <Td numeric>{formatCurrency(row.cost.monthlyPaymentAmortizing, { decimals: 0 })}</Td>
                <Td numeric>{formatCurrency(row.cost.annualDebtService)}</Td>
                <Td numeric className={row.dscrUnderTerms !== null && row.dscrUnderTerms < 1.25 ? 'font-medium text-critical' : ''}>
                  {formatRatio(row.dscrUnderTerms)}
                </Td>
                <Td numeric className="whitespace-nowrap">
                  {row.indication.closing_timeline_days ? `${row.indication.closing_timeline_days}d` : '—'}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <div className="space-y-3">
        {comparisons.map((row) => (
          <Card key={row.indication.id}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-7 items-center justify-center bg-accent text-[10px] font-semibold text-white rounded-[2px]">
                    {row.lender.logo_initials}
                  </span>
                  <span className="text-[14px] font-semibold text-ink">{row.lender.institution_name}</span>
                  <Badge tone={row.rank === 1 ? 'positive' : 'neutral'}>Rank {row.rank}</Badge>
                  <Badge tone={row.indication.is_commitment ? 'positive' : 'neutral'}>
                    {row.indication.is_commitment ? 'Commitment' : 'Indication of interest'}
                  </Badge>
                  {row.indication.version > 1 ? <Badge tone="neutral">Revision {row.indication.version}</Badge> : null}
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {formatCurrency(row.indication.loan_amount)} at {formatPercent(row.indication.all_in_rate_pct, 2)}
                  {' · '}{Math.round(row.indication.term_months / 12)}-year term
                  {row.indication.expires_at ? ` · expires ${formatDate(row.indication.expires_at)}` : ''}
                </p>
              </div>
              {canSelect && !selected ? (
                <SelectIndication
                  dealId={dealId}
                  indicationId={row.indication.id}
                  lenderName={row.lender.institution_name}
                />
              ) : null}
            </div>

            <CardBody className="grid gap-5 lg:grid-cols-3">
              <div>
                <p className="eyebrow mb-2">Cost of capital</p>
                <dl className="space-y-1.5 text-[12px]">
                  <CostRow label="All-in rate" value={formatPercent(row.indication.all_in_rate_pct, 2)} />
                  <CostRow label="Effective cost (fee-loaded)" value={formatPercent(row.cost.effectiveRatePct, 2)} strong />
                  <CostRow label="Origination fee" value={formatCurrency(row.cost.originationFee)} />
                  <CostRow label="Exit fee" value={formatCurrency(row.cost.exitFee)} />
                  <CostRow label="Total interest over term" value={formatCurrency(row.cost.totalInterest)} />
                  <CostRow label="Total cost of capital" value={formatCurrency(row.cost.totalCostOfCapital)} strong />
                  <CostRow label="Balloon at maturity" value={formatCurrency(row.cost.balloonBalance)} />
                </dl>
              </div>

              <div>
                <p className="eyebrow mb-2">Structure</p>
                <dl className="space-y-1.5 text-[12px]">
                  <CostRow label="Recourse" value={titleize(row.indication.recourse)} />
                  <CostRow label="Interest-only" value={row.indication.interest_only_months ? `${row.indication.interest_only_months} months` : 'None'} />
                  <CostRow label="Amortization" value={`${Math.round(row.indication.amortization_months / 12)} years`} />
                  <CostRow label="Closing timeline" value={row.indication.closing_timeline_days ? `${row.indication.closing_timeline_days} days` : 'Not stated'} />
                  <CostRow label="Prepayment" value={row.indication.prepayment_terms ?? 'Not stated'} />
                  <CostRow label="Guarantees" value={row.indication.guarantees ?? 'Not stated'} />
                </dl>
              </div>

              <div>
                <p className="eyebrow mb-2">Conditions & covenants</p>
                {row.conditions.length ? (
                  <ul className="space-y-1 text-[12px] leading-relaxed text-ink-secondary">
                    {row.conditions.map((condition) => (
                      <li key={condition.id} className="flex gap-1.5">
                        <span className="text-ink-muted">·</span>
                        <span>
                          {condition.label}
                          <Badge tone="neutral" className="ml-1.5">{titleize(condition.kind)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-muted">No specific conditions stated.</p>
                )}
                {row.indication.covenants ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
                    <span className="font-medium text-ink">Covenants. </span>{row.indication.covenants}
                  </p>
                ) : null}
                {row.indication.additional_terms ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
                    <span className="font-medium text-ink">Additional terms. </span>{row.indication.additional_terms}
                  </p>
                ) : null}
              </div>
            </CardBody>

            {snapshot?.summary.noi && row.dscrUnderTerms !== null ? (
              <div className="border-t border-line bg-surface-sunken px-4 py-2 text-[11px] text-ink-secondary">
                Under these terms the deal covers at{' '}
                <strong className="tnum">{formatRatio(row.dscrUnderTerms)}</strong> on underwritten NOI of{' '}
                {formatCurrency(snapshot.summary.noi)}
                {row.dscrUnderTerms < 1.25 ? ' — below the 1.25x floor most covenants set.' : '.'}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}

function CostRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className={strong ? 'tnum shrink-0 font-semibold text-ink' : 'tnum shrink-0 text-ink'}>{value}</dd>
    </div>
  )
}

export const dynamic = 'force-dynamic'
