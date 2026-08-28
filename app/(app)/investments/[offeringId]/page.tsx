import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canViewOffering } from '@/lib/policy'
import { assetNoun } from '@/lib/deal/display'
import { offeringLocation, offeringTitle } from '@/lib/equity/display'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Alert, Badge, Card, CardBody, DefinitionList, Progress, Section, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { CapitalStackChart } from '@/components/equity/capital-stack-chart'
import { InvestmentTicket } from './ticket'
import { NdaGate } from './nda-gate'
import { AskPanel } from './ask-panel'
import { BearCase } from './bear-case'
import { Disclose } from './disclose'
import { analyzeOffering, INVESTOR_SUGGESTED_QUESTIONS } from '@/services/equity/analysis'
import { activeStack } from '@/services/equity/capital-stack'
import { dataRoomFor, lockedCounts } from '@/services/equity/data-room'
import { evaluateEligibility } from '@/services/equity/commitments'
import { questionsFor } from '@/services/equity/portfolio'
import { ndaState } from '@/services/equity/nda'
import { accountFor } from '@/services/accounts/accounts'
import { spendableFor } from '@/services/accounts/ledger'
import { CURRENT_NDA } from '@/lib/equity/nda'
import type { EligibilityResult } from '@/lib/equity/eligibility'

export const dynamic = 'force-dynamic'

/**
 * The investment detail page.
 *
 * Four questions in order: what is it, what could it pay, what could go wrong,
 * and who is running it. Everything an investor needs to *decide whether to
 * keep reading* is above the fold; everything they need to *do the reading* is
 * one disclosure away underneath.
 *
 * The detail was previously all open at once — ten stacked sections, four
 * tables, and five action panels beside them — which meant the risks and the
 * projections competed with a facility bed count for the same attention. Now
 * the summary of each is always visible and the workings open on request.
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

  // Everything below the teaser comes out of the operator's own record, so
  // nothing below the teaser is loaded until the agreement is signed. Gating
  // the render alone would still have fetched it.
  const nda = await ndaState(actor, offeringId)

  const [terms, snapshot] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    buildSnapshot(offering.deal_id),
  ])
  if (!snapshot) notFound()

  const [analysis, stack, documents, locked, questions] = nda.accepted
    ? await Promise.all([
      analyzeOffering(offeringId),
      activeStack(offering.deal_id),
      dataRoomFor(actor, offeringId),
      lockedCounts(actor, offeringId),
      questionsFor(actor, offeringId),
    ])
    : [null, null, [], [], []]

  // What the ticket needs: whether they may invest, how much cash is actually
  // spendable right now, what they already hold here, and what they will be
  // asked to acknowledge. All of it is loaded server-side; the ticket computes
  // no money and is handed no way to.
  let eligibility: EligibilityResult | null = null
  let committedCents: number | null = null
  let spendableCents = 0
  let hasAccount = false
  let hasInterest = false
  let disclosures: { id: string; title: string }[] = []
  if (actor.investor && nda.accepted) {
    const investorId = actor.investor.id
    const [result, commitments, account, required, interest] = await Promise.all([
      evaluateEligibility(actor, offeringId).catch(() => null),
      store.select('investment_commitments', { where: { offering_id: offeringId, investor_id: investorId } }),
      accountFor(actor),
      store.select('offering_disclosures', { where: { offering_id: offeringId } }),
      store.selectOne('investment_interests', { where: { offering_id: offeringId, investor_id: investorId } }),
    ])
    eligibility = result
    hasAccount = Boolean(account)
    hasInterest = Boolean(interest && !interest.withdrawn_at && interest.expressed_at)
    if (account) spendableCents = await spendableFor(account.id)
    disclosures = required
      .filter((disclosure) => disclosure.required)
      .map((disclosure) => ({ id: disclosure.id, title: disclosure.title }))
    // Withdrawn and rejected commitments are not "you are in"; anything still
    // standing is, and its amount is what the investor should be shown.
    const live = commitments.filter((c) => ['submitted', 'accepted', 'funded'].includes(c.status))
    committedCents = live.length > 0
      ? live.reduce((total, c) => total + Math.round(c.amount * 100), 0)
      : null
  }

  const { deal, facility, sponsor, summary, latest, prior } = snapshot
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const revealIdentity = nda.accepted || deal.company_id === actor.company.id || actor.isAdmin
  const projection = analysis?.projection ?? null
  const risk = analysis?.risk ?? null
  const raised = offering.target_raise && offering.target_raise > 0
    ? (offering.committed_amount / offering.target_raise) * 100
    : null

  return (
    <div className="space-y-5">
      {/* ---- header: the four figures a decision starts from --------------- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-ink">
              {offeringTitle(offering, deal, facility, revealIdentity)}
            </h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {[
                offeringLocation(deal, facility, revealIdentity),
                assetNoun(deal.asset_type),
                beds ? `${beds} beds` : null,
                terms?.capital_position === 'preferred_equity' ? 'Preferred equity' : 'Common equity',
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Badge tone={offering.status === 'live' ? 'positive' : 'neutral'}>
            {offering.status === 'live' ? 'Open' : offering.status === 'fully_subscribed' ? 'Fully subscribed' : 'Closed'}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line md:grid-cols-4">
          <HeaderStat
            label="Target return"
            value={terms?.target_irr_pct ? formatPercent(terms.target_irr_pct) : '—'}
            hint="a year, projected"
          />
          <HeaderStat
            label="Minimum"
            value={formatCurrency(offering.minimum_investment, { compact: true })}
            hint="to take part"
          />
          <HeaderStat
            label="Money is tied up"
            value={terms?.target_hold_months ? `${Math.round(terms.target_hold_months / 12)} years` : '—'}
            hint="target, could be longer"
          />
          <HeaderStat
            label="Raised so far"
            value={`${formatCurrency(offering.committed_amount, { compact: true })}${
              offering.target_raise ? ` of ${formatCurrency(offering.target_raise, { compact: true })}` : ''
            }`}
          />
        </div>
        {raised !== null ? <Progress className="mt-3" value={raised} showLabel /> : null}
      </Card>

      <Alert tone="neutral">
        This is a private investment. Your money is committed for years, there is no market to sell
        your stake in, and you could lose all of it. Every forward-looking figure below is projected
        from assumptions the sponsor has stated — not a forecast, and not a promise. CareCapital
        Exchange is not your broker or adviser and does not recommend this or any investment.
      </Alert>

      {!nda.accepted ? (
        <NdaGate offeringId={offeringId} nda={CURRENT_NDA} />
      ) : (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* ---- what it is ------------------------------------------------ */}
          {analysis ? (
            <Section title="What this is">
              <CardBody>
                <p className="text-[13px] leading-relaxed text-ink-secondary">{analysis.analysis.thesis}</p>
                <p className="mt-2 text-[11px] text-ink-muted">
                  Written by the {analysis.generatedBy} analyst from the sponsor&rsquo;s own filings.
                </p>
              </CardBody>
            </Section>
          ) : null}

          {/* ---- what it could pay ----------------------------------------- */}
          <Section
            title="What it could pay"
            description="Projected from the assumptions the sponsor stated. Not a forecast of what will happen."
          >
            <CardBody className="space-y-4">
              {projection === null || projection.insufficientData !== null ? (
                <Alert tone="warning" title="Insufficient data to project returns">
                  {projection?.insufficientData ?? 'This offering has not supplied the assumptions a projection requires.'}
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line md:grid-cols-4">
                    <HeaderStat label="Return a year" value={formatPercent(projection.irrPct)} hint="projected IRR" />
                    <HeaderStat label="On every dollar" value={formatRatio(projection.equityMultiple)} hint="projected, over the hold" />
                    <HeaderStat label="Paid out yearly" value={formatPercent(projection.averageCashOnCashPct)} hint="projected average" />
                    <HeaderStat label="Sale value" value={formatCurrency(projection.exitValue, { compact: true })} hint="projected at exit" />
                  </div>

                  <Disclose summary="Show the year-by-year working">
                    <div className="overflow-x-auto">
                      <Table minWidth="min-w-[44rem]">
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

                    <div className="mt-3">
                      <h4 className="text-[12px] font-semibold text-ink">What those figures assume</h4>
                      <ul className="mt-2 grid gap-1 text-[12px] text-ink-muted sm:grid-cols-2">
                        {projection.assumptionsUsed.map((a) => (
                          <li key={a.label}>{a.label}: <span className="text-ink-secondary">{a.value}</span></li>
                        ))}
                      </ul>
                    </div>
                  </Disclose>

                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    Projections are estimates and are not guarantees of future performance. Actual
                    results will differ, and can differ substantially.
                  </p>
                </>
              )}
            </CardBody>
          </Section>

          {/* ---- what could go wrong ---------------------------------------- */}
          {risk ? (
            <Section
              title="What could go wrong"
              description={`Scored from the deal's own figures. ${Math.round(risk.coverage * 100)}% of the expected inputs were available.`}
            >
              <CardBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="tnum text-[26px] font-semibold text-ink">{risk.overallScore}</div>
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

                <Disclose summary={`Show all ${risk.categories.length} risks in detail`}>
                  <div className="space-y-2.5">
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
                  </div>
                </Disclose>

                <BearCase offeringId={offeringId} />
              </CardBody>
            </Section>
          ) : null}

          {/* ---- the underlying record -------------------------------------- */}
          <Section
            title="The property and the deal"
            description="Everything behind the figures above, as the sponsor filed it."
          >
            <CardBody className="space-y-3">
              <Disclose summary="How the purchase is being paid for">
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
                {stack ? (
                  <div className="mt-4">
                    <h4 className="text-[12px] font-semibold text-ink">Who gets paid back first</h4>
                    <div className="mt-2">
                      <CapitalStackChart sources={stack.sources} total={stack.total} />
                    </div>
                  </div>
                ) : null}
              </Disclose>

              <Disclose summary="The facility itself">
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
              </Disclose>

              <Disclose summary="How it has actually performed">
                <p className="mb-2 text-[12px] text-ink-muted">
                  Reported results. These are actual figures from the operator&rsquo;s statements, not
                  projections.
                </p>
                <div className="overflow-x-auto">
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
                </div>
              </Disclose>

              <Disclose summary="Who is running it">
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
              </Disclose>

              {analysis && analysis.analysis.missing_information.length > 0 ? (
                <Disclose summary={`${analysis.analysis.missing_information.length} things the sponsor has not supplied`}>
                  <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
                    {analysis.analysis.missing_information.map((item) => <li key={item}>· {item}</li>)}
                  </ul>
                </Disclose>
              ) : null}
            </CardBody>
          </Section>

          {/* ---- documents --------------------------------------------------- */}
          <Section title="Documents" description="What has been released to you at your current access level.">
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
          <AskPanel
            offeringId={offeringId}
            offeringName={offeringTitle(offering, deal, facility, revealIdentity)}
            suggestions={
              analysis && analysis.analysis.questions_to_ask.length > 0
                ? analysis.analysis.questions_to_ask.slice(0, 5)
                : INVESTOR_SUGGESTED_QUESTIONS
            }
            answered={questions}
          />
        </div>

        {/* ---- the one action panel ------------------------------------------ */}
        <div>
          <InvestmentTicket
            offeringId={offeringId}
            offeringName={offeringTitle(offering, deal, facility, revealIdentity)}
            minimum={offering.minimum_investment}
            maximum={offering.maximum_investment}
            availableCents={spendableCents}
            eligibility={eligibility}
            status={offering.status}
            isInvestor={Boolean(actor.investor)}
            hasAccount={hasAccount}
            committedCents={committedCents}
            disclosures={disclosures}
            fees={{
              acquisitionPct: terms?.acquisition_fee_pct ?? null,
              managementPct: terms?.asset_management_fee_pct ?? null,
              dispositionPct: terms?.disposition_fee_pct ?? null,
            }}
            holdYears={terms?.target_hold_months ? Math.round(terms.target_hold_months / 12) : null}
            structure={terms?.capital_position === 'preferred_equity' ? 'Preferred equity' : 'Common equity'}
            hasInterest={hasInterest}
          />
        </div>
      </div>
      )}
    </div>
  )
}

function HeaderStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      <div className="tnum mt-0.5 text-[17px] font-semibold text-ink">{value}</div>
      {hint ? <div className="text-[11px] text-ink-muted">{hint}</div> : null}
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
