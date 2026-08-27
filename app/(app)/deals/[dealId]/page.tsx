import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'

import { buildSnapshot } from '@/lib/deal/snapshot'
import { latestRun, readinessFor } from '@/services/underwriting'
import { scoreBand } from '@/lib/underwriting/score'
import {
  Card, CardBody, CardHeader, CardTitle, DefinitionList, Section, Table, Td, Tr,
} from '@/components/ui/primitives'
import { BarChart, DonutChart, ScoreRing } from '@/components/charts'
import { MetricTile, NextAction, ReadinessBar, SeverityBadge } from '@/components/deal/common'
import { formatCurrency, formatDate, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import { priorityLabel } from '@/services/indications'
import { debtMarketplaceEnabled } from '@/lib/product'
import { RaiseNextAction } from './raise-next-action'

export default async function DealOverviewPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  await requireActor()

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const store = await db()
  const debtMarketplace = debtMarketplaceEnabled()
  const [readiness, run, discrepancies, matchCount, indicationCount, offerings] = await Promise.all([
    readinessFor(dealId),
    latestRun(dealId),
    store.select('discrepancies', { where: { deal_id: dealId, status: 'open' } }),
    store.count('matches', { where: { deal_id: dealId, hard_fail: false } }),
    store.count('indications', { where: { deal_id: dealId, status: { in: ['submitted', 'updated', 'selected'] } } }),
    store.select('offerings', { where: { deal_id: dealId } }),
  ])

  const { deal, facility, terms, summary, metrics, periods, latest, prior } = snapshot
  const historical = periods.filter((p) => p.period.period_type !== 'projection')
  const band = run?.overall_score !== null && run?.overall_score !== undefined ? scoreBand(run.overall_score) : null

  return (
    <div className="space-y-4">
      {/* Next action ------------------------------------------------------ */}
      {!debtMarketplace ? (
        <RaiseNextAction
          dealId={dealId}
          offerings={offerings}
          discrepancies={discrepancies}
          readiness={readiness}
        />
      ) : indicationCount > 0 ? (
        <NextAction
          tone="positive"
          headline={`${indicationCount} financing indication${indicationCount === 1 ? '' : 's'} received`}
          detail={`Ranked against your stated priority: ${priorityLabel(deal.borrower_priority)}.`}
          action={{ href: `/deals/${dealId}/indications`, label: 'Compare indications' }}
        />
      ) : discrepancies.length > 0 ? (
        <NextAction
          tone="warning"
          headline={`${discrepancies.length} item${discrepancies.length === 1 ? '' : 's'} need attention`}
          detail="These are conflicts and gaps a lender would find in diligence. Resolving them now avoids the questions coming back individually from every lender."
          items={discrepancies.slice(0, 4).map((item) => ({ label: item.title, href: `/deals/${dealId}/issues` }))}
          action={{ href: `/deals/${dealId}/issues`, label: 'Review issues' }}
        />
      ) : readiness?.canDistribute ? (
        <NextAction
          tone="positive"
          headline={`${matchCount} lender${matchCount === 1 ? '' : 's'} match this opportunity`}
          detail="The package is complete. You will see the full recipient list before anything is sent."
          action={{ href: `/deals/${dealId}/distribute`, label: 'Distribute deal' }}
          secondary={{ href: `/deals/${dealId}/memo`, label: 'Review credit memo' }}
        />
      ) : (
        <NextAction
          headline={`${readiness?.requiredOutstanding.length ?? 0} item${readiness?.requiredOutstanding.length === 1 ? '' : 's'} needed before lender distribution`}
          detail={readiness?.blockingReason ?? undefined}
          items={readiness?.requiredOutstanding.slice(0, 5).map((item) => ({ label: item.label, href: item.href }))}
          action={{ href: `/deals/${dealId}/documents`, label: 'Upload documents' }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Narrative --------------------------------------------------- */}
          {deal.narrative ? (
            <Section title="Transaction summary">
              <CardBody>
                <p className="text-[13px] leading-relaxed text-ink-secondary">{deal.narrative}</p>
              </CardBody>
            </Section>
          ) : null}

          {/* Underwriting metrics ---------------------------------------- */}
          <Section
            title="Underwriting metrics"
            description={
              snapshot.assumedTerms.assumed
                ? `Coverage computed on a platform assumption of ${formatPercent(snapshot.assumedTerms.ratePct)} over ${snapshot.assumedTerms.amortizationMonths / 12} years, since no terms have been requested.`
                : `Computed on requested terms of ${formatPercent(snapshot.assumedTerms.ratePct)} over ${snapshot.assumedTerms.termMonths / 12} years.`
            }
          >
            <div className="data-grid grid-cols-2 border-t border-line sm:grid-cols-4">
              <MetricTile label="LTV" value={formatPercent(summary.ltv)} formula="loan ÷ lesser of appraised value and price" detail={summary.valueBasis ? `on ${formatCurrency(summary.valueBasis, { compact: true })} value` : undefined} />
              {debtMarketplace ? (
                <MetricTile label="Loan-to-cost" value={formatPercent(summary.loanToCost)} formula="loan ÷ total project cost" />
              ) : (
                <MetricTile label="Total cost" value={formatCurrency(summary.totalCost, { compact: true })} formula="purchase price or payoff, plus closing costs, capex and working capital" />
              )}
              <MetricTile label="DSCR" value={formatRatio(summary.dscr)} formula="underwritten NOI ÷ annual debt service" tone={summary.dscr !== null && summary.dscr < 1.25 ? 'critical' : summary.dscr !== null && summary.dscr >= 1.45 ? 'positive' : undefined} />
              {debtMarketplace ? (
                <MetricTile label="Debt yield" value={formatPercent(summary.debtYield)} formula="underwritten NOI ÷ loan amount" />
              ) : (
                <MetricTile label="Senior debt" value={formatCurrency(summary.loanAmount, { compact: true })} />
              )}
              <MetricTile label="Underwritten NOI" value={formatCurrency(summary.noi, { compact: true })} detail={summary.noiAdjustments.length ? `${summary.noiAdjustments.length} adjustment${summary.noiAdjustments.length === 1 ? '' : 's'} applied` : undefined} />
              <MetricTile label="EBITDA margin" value={formatPercent(summary.ebitdaMargin)} />
              <MetricTile label="Annual debt service" value={formatCurrency(summary.annualDebtService, { compact: true })} detail={summary.yearOneDebtService !== summary.annualDebtService ? `${formatCurrency(summary.yearOneDebtService, { compact: true })} in year one` : undefined} />
              {debtMarketplace ? (
                <MetricTile label="Equity required" value={formatCurrency(summary.equityRequirement, { compact: true })} />
              ) : (
                // Equity-to-close is legitimately zero on a cash-out refinance
                // while the raise beneath it is for millions, and the two read
                // as a contradiction. Occupancy is the figure both a sponsor
                // and an investor actually watch.
                <MetricTile label="Occupancy" value={formatPercent(metrics?.occupancy_pct ?? null)} detail={metrics?.period_label ?? undefined} />
              )}
            </div>
          </Section>

          {/* Historical performance -------------------------------------- */}
          {historical.length > 0 ? (
            <Section
              title="Historical performance"
              description={`${historical.length} period${historical.length === 1 ? '' : 's'} on file.`}
              actions={<Link href={`/deals/${dealId}/financials`} className="text-[12px] text-accent hover:underline">Full financials</Link>}
            >
              <CardBody className="space-y-5">
                <BarChart
                  series={historical.map((p) => ({ label: p.period.label, value: p.items.revenue ?? null }))}
                  format={(value) => formatCurrency(value, { compact: true })}
                  height={110}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricTile
                    label="Revenue growth"
                    value={formatPercent(summary.revenueGrowthPct)}
                    tone={summary.revenueGrowthPct !== null && summary.revenueGrowthPct < 0 ? 'critical' : 'positive'}
                    detail={prior && latest ? `${prior.period.label} → ${latest.period.label}` : undefined}
                    className="border border-line"
                  />
                  <MetricTile
                    label="EBITDA growth"
                    value={formatPercent(summary.ebitdaGrowthPct)}
                    tone={summary.ebitdaGrowthPct !== null && summary.ebitdaGrowthPct < 0 ? 'critical' : 'positive'}
                    className="border border-line"
                  />
                  <MetricTile
                    label="Revenue per patient day"
                    value={formatCurrency(summary.revenuePerPatientDay, { decimals: 2 })}
                    className="border border-line"
                  />
                </div>
              </CardBody>
            </Section>
          ) : null}

          {/* Sources & uses ---------------------------------------------- */}
          {summary.sourcesAndUses.totalUses > 0 ? (
            <Section
              title="Sources & uses"
              description={summary.sourcesAndUses.balanced ? 'The capital stack balances.' : 'The capital stack does not currently balance.'}
            >
              <div className="grid border-t border-line sm:grid-cols-2">
                <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
                  <p className="eyebrow mb-2">Uses</p>
                  <SourcesTable lines={summary.sourcesAndUses.uses} total={summary.sourcesAndUses.totalUses} />
                </div>
                <div className="p-4">
                  <p className="eyebrow mb-2">Sources</p>
                  <SourcesTable lines={summary.sourcesAndUses.sources} total={summary.sourcesAndUses.totalSources} />
                </div>
              </div>
            </Section>
          ) : null}
        </div>

        <div className="space-y-4">
          {/* Deal score --------------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle>Deal score</CardTitle>
              {run ? (
                <Link href={`/deals/${dealId}/analysis`} className="text-[12px] text-accent hover:underline">Analysis</Link>
              ) : null}
            </CardHeader>
            <CardBody>
              {run?.overall_score !== null && run?.overall_score !== undefined ? (
                <>
                  <ScoreRing
                    score={run.overall_score}
                    tone={band?.tone === 'strong' ? 'positive' : band?.tone === 'weak' ? 'critical' : band?.tone === 'watch' ? 'warning' : 'accent'}
                    label={band?.label}
                    sublabel={`Based on ${Math.round((run.confidence ?? 0) * 100)}% coverage of the expected inputs.`}
                  />
                  <ul className="mt-4 space-y-2">
                    {run.score_components.map((component) => (
                      <li key={component.key}>
                        <div className="flex items-baseline justify-between gap-2 text-[12px]">
                          <span className="truncate text-ink-secondary">
                            {component.label}
                            <span className="ml-1 text-ink-muted">{Math.round(component.weight * 100)}%</span>
                          </span>
                          <span className="tnum shrink-0 font-medium text-ink">{component.score}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            className={component.data_quality === 'missing' ? 'h-full bg-line-strong' : 'h-full bg-accent'}
                            style={{ width: `${component.score}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                    A score is only as precise as the data behind it. Components drawn from missing
                    inputs score neutrally and are shown in grey.
                  </p>
                </>
              ) : (
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  No analysis has been run yet. Upload financial statements and run the underwriting
                  analysis to produce a score.
                </p>
              )}
            </CardBody>
          </Card>

          {readiness ? (
            <ReadinessBar
              score={readiness.overall}
              canDistribute={readiness.canDistribute}
              blockingReason={readiness.blockingReason}
              href={debtMarketplace ? `/deals/${dealId}/distribute` : `/deals/${dealId}/equity`}
              ready={debtMarketplace ? undefined : 'Everything an investor needs to read is on file.'}
              action={debtMarketplace ? undefined : 'Open the raise'}
            />
          ) : null}

          {/* Payer mix ---------------------------------------------------- */}
          {metrics ? (
            <Section title="Payer mix" description={metrics.period_label}>
              <CardBody>
                <DonutChart
                  segments={[
                    { label: 'Medicare', value: metrics.medicare_pct ?? 0 },
                    { label: 'Medicaid', value: metrics.medicaid_pct ?? 0 },
                    { label: 'Managed care', value: metrics.managed_care_pct ?? 0 },
                    { label: 'Private pay', value: metrics.private_pay_pct ?? 0 },
                    { label: 'Other', value: metrics.other_payer_pct ?? 0 },
                  ]}
                  centerValue={metrics.medicaid_pct !== null ? `${metrics.medicaid_pct.toFixed(0)}%` : '—'}
                  centerLabel="Medicaid"
                />
              </CardBody>
            </Section>
          ) : null}

          {/* Facility ------------------------------------------------------ */}
          <Section title="Facility" actions={<Link href={`/deals/${dealId}/operations`} className="text-[12px] text-accent hover:underline">Edit</Link>}>
            <CardBody>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Licensed beds', value: facility?.licensed_beds ?? '—' },
                  { label: 'Operating beds', value: facility?.operating_beds ?? '—' },
                  { label: 'Current census', value: facility?.current_census ?? '—' },
                  { label: 'Occupancy', value: formatPercent(facility?.occupancy_pct ?? summary.occupancyPct) },
                  { label: 'Year built', value: facility?.year_built ?? '—' },
                  { label: 'Last renovation', value: facility?.last_renovation_year ?? '—' },
                  { label: 'Real estate', value: facility?.real_estate_included ? 'Included' : 'Not included' },
                  { label: 'CMS rating', value: facility?.cms_star_rating ? `${facility.cms_star_rating} of 5` : '—' },
                ]}
              />
            </CardBody>
          </Section>

          {/* Transaction --------------------------------------------------- */}
          <Section title="Transaction" actions={<Link href={`/deals/${dealId}/transaction`} className="text-[12px] text-accent hover:underline">Edit</Link>}>
            <CardBody>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Purchase price', value: formatCurrency(terms?.purchase_price ?? null, { compact: true }) },
                  { label: 'Appraised value', value: formatCurrency(terms?.appraised_value ?? null, { compact: true }) },
                  { label: 'Existing debt', value: formatCurrency(terms?.existing_debt ?? null, { compact: true }) },
                  { label: 'Seller financing', value: formatCurrency(terms?.seller_financing ?? null, { compact: true }) },
                  { label: 'Target close', value: formatDate(terms?.target_close_date ?? null) },
                  { label: 'Priority', value: titleize(priorityLabel(deal.borrower_priority)) },
                ]}
              />
            </CardBody>
          </Section>

          {/* Open issues --------------------------------------------------- */}
          {discrepancies.length ? (
            <Section
              title="Open items"
              actions={<Link href={`/deals/${dealId}/issues`} className="text-[12px] text-accent hover:underline">All issues</Link>}
            >
              <Table>
                <tbody>
                  {discrepancies.slice(0, 5).map((item) => (
                    <Tr key={item.id}>
                      <Td className="w-20"><SeverityBadge severity={item.severity} /></Td>
                      <Td className="text-[12px] text-ink-secondary">{item.title}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SourcesTable({
  lines, total,
}: {
  lines: { label: string; amount: number; pct: number | null }[]
  total: number
}) {
  return (
    <Table>
      <tbody>
        {lines.map((line) => (
          <tr key={line.label}>
            <Td className="border-none px-0 py-1 text-[12px] text-ink-secondary">{line.label}</Td>
            <Td numeric className="border-none px-0 py-1 text-[12px] text-ink-muted">{formatPercent(line.pct)}</Td>
            <Td numeric className="border-none px-0 py-1 text-[12px] font-medium text-ink">
              {formatCurrency(line.amount, { compact: true })}
            </Td>
          </tr>
        ))}
        <tr>
          <Td className="px-0 pt-2 text-[12px] font-semibold text-ink">Total</Td>
          <Td numeric className="px-0 pt-2" />
          <Td numeric className="px-0 pt-2 text-[12px] font-semibold text-ink">
            {formatCurrency(total, { compact: true })}
          </Td>
        </tr>
      </tbody>
    </Table>
  )
}
