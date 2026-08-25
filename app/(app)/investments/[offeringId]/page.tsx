import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canViewOffering } from '@/lib/policy'
import { assetNoun, stateName } from '@/lib/deal/display'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, DefinitionList, Section, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { CapitalStackChart } from '@/components/equity/capital-stack-chart'
import { InvestorActions } from './actions-panel'
import { AskPanel } from './ask-panel'
import { analyzeOffering, INVESTOR_SUGGESTED_QUESTIONS } from '@/services/equity/analysis'
import { activeStack } from '@/services/equity/capital-stack'
import { dataRoomFor, lockedCounts } from '@/services/equity/data-room'
import { evaluateEligibility } from '@/services/equity/commitments'
import { questionsFor } from '@/services/equity/portfolio'
import type { EligibilityResult } from '@/lib/equity/eligibility'

export const dynamic = 'force-dynamic'

/**
 * The investment detail page.
 *
 * Ordered so an investor can answer the questions that matter within a minute:
 * what it is, what it costs to participate, what the sponsor projects, what
 * could go wrong, who is running it, and what they can read. Risks are not
 * below the fold as an afterthought — they sit between the projections and the
 * sponsor, where someone reading in order will meet them.
 *
 * Every projected figure is computed by the deterministic engine and carries
 * its assumptions. Nothing here is described as expected, safe or guaranteed.
 */
export default async function OfferingPage({
  params,
}: {
  params: Promise<{ offeringId: string }>
}) {
  const { offeringId } = await params
  const actor = await requireActor()
  const store = await db()

  const offering = await store.findById('offerings', offeringId)
  if (!offering) notFound()
  if (!canViewOffering(subjectOf(actor), offering)) notFound()

  const [terms, snapshot, analysis, stack, documents, locked, questions] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    buildSnapshot(offering.deal_id),
    analyzeOffering(offeringId),
    activeStack(offering.deal_id),
    dataRoomFor(actor, offeringId),
    lockedCounts(actor, offeringId),
    questionsFor(actor, offeringId),
  ])
  if (!snapshot) notFound()

  let eligibility: EligibilityResult | null = null
  if (actor.investor) {
    eligibility = await evaluateEligibility(actor, offeringId).catch(() => null)
  }

  const { deal, facility, sponsor, summary, latest, prior } = snapshot
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const projection = analysis?.projection ?? null
  const risk = analysis?.risk ?? null

  return (
    <div className="space-y-5">
      {/* ---- header ------------------------------------------------------- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{offering.reference}</p>
            <h1 className="mt-1 text-[22px] font-semibold text-ink">{offering.name}</h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {[
                facility?.state ? stateName(facility.state) : null,
                assetNoun(deal.asset_type),
                beds ? `${beds} beds` : null,
                terms?.capital_position === 'preferred_equity' ? 'Preferred equity offering' : 'Common equity offering',
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Badge tone={offering.status === 'live' ? 'positive' : 'neutral'}>
            {offering.status === 'live' ? 'Open' : offering.status === 'fully_subscribed' ? 'Fully subscribed' : 'Closed'}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line md:grid-cols-4">
          <HeaderStat label="Target raise" value={formatCurrency(offering.target_raise)} />
          <HeaderStat label="Minimum investment" value={formatCurrency(offering.minimum_investment)} />
          <HeaderStat
            label="Target hold"
            value={terms?.target_hold_months ? `${Math.round(terms.target_hold_months / 12)} years` : '—'}
          />
          <HeaderStat
            label="Committed"
            value={`${formatCurrency(offering.committed_amount, { compact: true })}${
              offering.target_raise ? ` of ${formatCurrency(offering.target_raise, { compact: true })}` : ''
            }`}
          />
        </div>
      </Card>

      <Alert tone="neutral">
        This is an offering of unregistered securities in a private company. It is illiquid, you may
        lose your entire investment, and every forward-looking figure below is a projection derived
        from assumptions the sponsor has stated — not a forecast, and not a promise. CareCapital
        Exchange is not your broker or adviser and does not recommend this or any investment.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* ---- thesis --------------------------------------------------- */}
          {analysis ? (
            <Section title="Investment thesis" description={`Prepared by the ${analysis.generatedBy} analyst from the deal record.`}>
              <CardBody>
                <p className="text-[13px] leading-relaxed text-ink-secondary">{analysis.analysis.thesis}</p>
              </CardBody>
            </Section>
          ) : null}

          {/* ---- deal overview -------------------------------------------- */}
          <Section title="Transaction">
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Purchase price', value: formatCurrency(snapshot.terms?.purchase_price ?? null) },
                  { label: 'Senior debt', value: formatCurrency(summary.loanAmount) },
                  { label: 'Total equity required', value: formatCurrency(summary.equityRequirement) },
                  { label: 'This offering', value: formatCurrency(offering.target_raise) },
                  { label: 'Total capitalisation', value: formatCurrency(summary.totalCost) },
                  { label: 'Issuer', value: offering.issuer_entity ?? 'Not stated' },
                  { label: 'Structure', value: offering.legal_structure ?? 'Not stated' },
                ]}
              />
            </CardBody>
          </Section>

          {/* ---- capital stack -------------------------------------------- */}
          {stack ? (
            <Section title="Capital stack" description="Where this investment sits in the order of repayment.">
              <CardBody>
                <CapitalStackChart sources={stack.sources} total={stack.total} />
              </CardBody>
            </Section>
          ) : null}

          {/* ---- facility -------------------------------------------------- */}
          <Section title="Facility">
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Licensed beds', value: facility?.licensed_beds?.toString() ?? '—' },
                  { label: 'Operating beds', value: facility?.operating_beds?.toString() ?? '—' },
                  { label: 'Occupancy', value: formatPercent(snapshot.metrics?.occupancy_pct ?? null) },
                  { label: 'Medicaid share', value: formatPercent(snapshot.metrics?.medicaid_pct ?? null) },
                  { label: 'Medicare share', value: formatPercent(snapshot.metrics?.medicare_pct ?? null) },
                  { label: 'Year built', value: facility?.year_built?.toString() ?? '—' },
                ]}
              />
            </CardBody>
          </Section>

          {/* ---- historical, kept apart from projected --------------------- */}
          <Section
            title="Historical performance"
            description="Reported results. These are actual figures from the operator's statements, not projections."
          >
            <CardBody className="overflow-x-auto p-0">
              <Table>
                <thead>
                  <Tr>
                    <Th>Line item</Th>
                    <Th numeric>{prior?.period.label ?? 'Prior'}</Th>
                    <Th numeric>{latest?.period.label ?? 'Latest'}</Th>
                  </Tr>
                </thead>
                <tbody>
                  <MoneyRow label="Revenue" prior={prior?.items.revenue} latest={latest?.items.revenue} />
                  <MoneyRow label="EBITDA" prior={prior?.items.ebitda} latest={latest?.items.ebitda} />
                  <MoneyRow label="Labour cost" prior={prior?.items.labor_expense} latest={latest?.items.labor_expense} />
                  <MoneyRow label="Agency labour" prior={prior?.items.agency_labor} latest={latest?.items.agency_labor} />
                  <Tr>
                    <Td>Underwritten NOI</Td>
                    <Td numeric>—</Td>
                    <Td numeric>{formatCurrency(summary.noi)}</Td>
                  </Tr>
                </tbody>
              </Table>
            </CardBody>
          </Section>

          {/* ---- projections ---------------------------------------------- */}
          <Section
            title="Projected performance"
            description="Every figure below is projected from the assumptions listed, not a forecast of what will happen."
          >
            <CardBody className="space-y-4">
              {projection === null || projection.insufficientData !== null ? (
                <Alert tone="warning" title="Insufficient data to project returns">
                  {projection?.insufficientData ?? 'This offering has not supplied the assumptions a projection requires.'}
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line md:grid-cols-4">
                    <HeaderStat label="Projected IRR" value={formatPercent(projection.irrPct)} tag="Projected" />
                    <HeaderStat label="Projected multiple" value={formatRatio(projection.equityMultiple)} tag="Projected" />
                    <HeaderStat label="Avg. cash on cash" value={formatPercent(projection.averageCashOnCashPct)} tag="Projected" />
                    <HeaderStat label="Projected exit value" value={formatCurrency(projection.exitValue, { compact: true })} tag="Projected" />
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <thead>
                        <Tr>
                          <Th>Year</Th>
                          <Th numeric>NOI</Th>
                          <Th numeric>Debt service</Th>
                          <Th numeric>DSCR</Th>
                          <Th numeric>Cash to equity</Th>
                          <Th numeric>Debt balance</Th>
                        </Tr>
                      </thead>
                      <tbody>
                        {projection.years.map((year) => (
                          <Tr key={year.year}>
                            <Td>Year {year.year}</Td>
                            <Td numeric>{formatCurrency(year.noi)}</Td>
                            <Td numeric>{formatCurrency(year.debtService)}</Td>
                            <Td numeric>{formatRatio(year.dscr)}</Td>
                            <Td numeric>{formatCurrency(year.cashFlowToEquity)}</Td>
                            <Td numeric>{formatCurrency(year.debtBalance)}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <div>
                    <h4 className="text-[12px] font-semibold text-ink">Assumptions behind these figures</h4>
                    <ul className="mt-2 grid gap-1 text-[12px] text-ink-muted sm:grid-cols-2">
                      {projection.assumptionsUsed.map((a) => (
                        <li key={a.label}>{a.label}: <span className="text-ink-secondary">{a.value}</span></li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    Projections are estimates and are not guarantees of future performance. Actual
                    results will differ, and can differ substantially.
                  </p>
                </>
              )}
            </CardBody>
          </Section>

          {/* ---- risks ----------------------------------------------------- */}
          {risk ? (
            <Section
              title="Risks"
              description={`Scored from the deal's own figures. ${Math.round(risk.coverage * 100)}% of the expected inputs were available.`}
            >
              <CardBody className="space-y-3">
                <div className="flex items-center gap-3 border-b border-line pb-3">
                  <div className="text-[26px] font-semibold tabular-nums text-ink">{risk.overallScore}</div>
                  <div>
                    <Badge tone={risk.overallBand === 'high' ? 'critical' : risk.overallBand === 'medium' ? 'warning' : 'positive'}>
                      {risk.overallBand} risk
                    </Badge>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      A summary of stated characteristics on a 0–100 scale, not a prediction and not
                      a guarantee. Higher is riskier.
                    </p>
                  </div>
                </div>
                {risk.categories.map((category) => (
                  <div key={category.category} className="border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium capitalize text-ink">{category.category}</span>
                      <Badge tone={category.band === 'high' ? 'critical' : category.band === 'medium' ? 'warning' : 'positive'}>
                        {category.available ? category.band : 'no data'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{category.rationale}</p>
                  </div>
                ))}
              </CardBody>
            </Section>
          ) : null}

          {/* ---- sponsor ---------------------------------------------------- */}
          <Section title="Sponsor">
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Entity', value: sponsor?.legal_entity ?? 'Not stated' },
                  { label: 'Years in healthcare', value: sponsor?.years_in_healthcare?.toString() ?? '—' },
                  { label: 'Facilities operated', value: sponsor?.facilities_operated?.toString() ?? '—' },
                  { label: 'Beds under management', value: sponsor?.beds_operated?.toString() ?? '—' },
                  { label: 'States', value: sponsor?.states_operated.join(', ') || '—' },
                  { label: 'Prior acquisitions', value: sponsor?.historical_acquisitions?.toString() ?? '—' },
                ]}
              />
            </CardBody>
          </Section>

          {/* ---- documents --------------------------------------------------- */}
          <Section title="Documents" description="Material released to you at your current access level.">
            <CardBody className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No documents have been released at your access level.</p>
              ) : (
                documents.map(({ entry, document }) => (
                  <a
                    key={entry.id}
                    href={`/api/documents/${document.id}/download`}
                    className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 hover:border-line-strong"
                  >
                    <span className="min-w-0 truncate text-[13px] text-ink">{entry.display_name}</span>
                    <span className="shrink-0 text-[11px] capitalize text-ink-muted">
                      {entry.category.replace(/_/g, ' ')}
                    </span>
                  </a>
                ))
              )}
              {locked.length > 0 ? (
                <p className="pt-1 text-[11px] text-ink-muted">
                  {locked.map((l) => `${l.count} document${l.count === 1 ? '' : 's'} become available to ${l.level.replace(/_/g, ' ')}s`).join('; ')}.
                </p>
              ) : null}
            </CardBody>
          </Section>

          {/* ---- questions ---------------------------------------------------- */}
          <Section title="Questions" description="Answered by the sponsor.">
            <CardBody className="space-y-3">
              {questions.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No questions have been asked yet.</p>
              ) : (
                questions.map(({ question, answers }) => (
                  <div key={question.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                    <p className="text-[13px] text-ink">{question.body}</p>
                    {answers.map((answer) => (
                      <p key={answer.id} className="mt-1.5 border-l-2 border-line pl-3 text-[12px] text-ink-secondary">
                        {answer.body}
                      </p>
                    ))}
                    {answers.length === 0 ? (
                      <p className="mt-1 text-[11px] text-ink-muted">Awaiting a response from the sponsor.</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardBody>
          </Section>
        </div>

        {/* ---- action rail --------------------------------------------------- */}
        <div className="space-y-4">
          <InvestorActions
            offeringId={offeringId}
            offeringName={offering.name}
            minimum={offering.minimum_investment}
            eligibility={eligibility}
            isInvestor={Boolean(actor.investor)}
            status={offering.status}
          />

          <AskPanel offeringId={offeringId} suggestions={INVESTOR_SUGGESTED_QUESTIONS} />

          {analysis ? (
            <Card>
              <CardHeader><CardTitle>What to ask</CardTitle></CardHeader>
              <CardBody>
                <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-secondary">
                  {analysis.analysis.questions_to_ask.slice(0, 6).map((question) => (
                    <li key={question}>· {question}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {analysis && analysis.analysis.missing_information.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Not yet supplied</CardTitle></CardHeader>
              <CardBody>
                <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
                  {analysis.analysis.missing_information.map((item) => <li key={item}>· {item}</li>)}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function HeaderStat({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
        {tag ? <span className="rounded bg-surface-sunken px-1 text-[9px] text-ink-muted">{tag}</span> : null}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  )
}

function MoneyRow({ label, prior, latest }: { label: string; prior?: number | null; latest?: number | null }) {
  return (
    <Tr>
      <Td>{label}</Td>
      <Td numeric>{formatCurrency(prior ?? null)}</Td>
      <Td numeric>{formatCurrency(latest ?? null)}</Td>
    </Tr>
  )
}
