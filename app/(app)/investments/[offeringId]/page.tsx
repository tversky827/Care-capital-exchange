import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canViewOffering } from '@/lib/policy'

import { offeringLocation, offeringTitle } from '@/lib/equity/display'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  Alert, Badge, CardBody, DefinitionList, Progress, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { CapitalStackChart } from '@/components/equity/capital-stack-chart'
import { InvestmentTicket } from './ticket'
import { PracticeTicket } from './practice-ticket'
import { NdaGate } from './nda-gate'
import { AskPanel } from './ask-panel'
import { BearCase } from './bear-case'
import { Disclose, Fold } from './disclose'
import { analyzeOffering, INVESTOR_SUGGESTED_QUESTIONS } from '@/services/equity/analysis'
import { activeStack } from '@/services/equity/capital-stack'
import { dataRoomFor, lockedCounts } from '@/services/equity/data-room'
import { evaluateEligibility } from '@/services/equity/commitments'
import { questionsFor } from '@/services/equity/portfolio'
import { ndaState } from '@/services/equity/nda'
import { accountFor } from '@/services/accounts/accounts'
import { spendableFor } from '@/services/accounts/ledger'
import { currentEnvironment } from '@/lib/environment'
import { catalogueFor, inCatalogue } from '@/lib/catalogue'
import { accountFor as sandboxAccountFor } from '@/services/practice/accounts'
import { balanceFor as sandboxBalanceFor } from '@/services/practice/ledger'
import { positionIn } from '@/services/practice/investing'
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

  // Which environment this reader is in decides which ticket they get and
  // which catalogue they may read. Resolved from the signed cookie, never from
  // anything on the page.
  const environment = await currentEnvironment(actor.user.id)

  const offering = await store.findById('offerings', offeringId)
  if (!offering) notFound()
  if (!canViewOffering(subjectOf(actor), offering)) notFound()
  // A raise from the other catalogue does not exist as far as this reader is
  // concerned. Guarding only the listing would leave every fictional raise
  // readable in the live product by anyone who had its URL — and a person
  // reading invented figures without the word "demonstration" anywhere on the
  // page is the failure this split exists to prevent.
  if (!inCatalogue(offering, catalogueFor(environment))) notFound()

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
  let sandboxCents = 0
  let sandboxHeldCents: number | null = null
  let sandboxWatching = false
  if (environment !== 'live' && nda.accepted) {
    const sandbox = await sandboxAccountFor(actor, environment)
    if (sandbox) {
      const [balance, held, watch] = await Promise.all([
        sandboxBalanceFor(sandbox.id),
        positionIn(sandbox.id, offeringId),
        store.selectOne('practice_watchlist', {
          where: { account_id: sandbox.id, offering_id: offeringId },
        }),
      ])
      sandboxCents = balance
      sandboxHeldCents = held?.invested_cents ?? null
      sandboxWatching = watch !== null
    }
  }

  if (actor.investor && nda.accepted && environment === 'live') {
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
      {/* ---- the hero -----------------------------------------------------
          One number. The four-figure grid that used to sit here asked an
          investor to read a table before they knew whether they cared, and
          three of the four were things you want AFTER you are interested, not
          before. They are one line down, in a sentence. */}
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[30px]">
          {offeringTitle(offering, deal, facility, revealIdentity)}
        </h1>
        <p className="mt-1 text-[14px] text-ink-secondary">
          {[
            offeringLocation(deal, facility, revealIdentity),
            beds ? `${beds} beds` : null,
          ].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-[46px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[56px]">
            {terms?.target_irr_pct ? formatPercent(terms.target_irr_pct) : '—'}
          </span>
          <span className="text-[14px] text-ink-secondary">a year, targeted</span>
        </div>

        <p className="mt-3 text-[13px] text-ink-secondary">
          {[
            offering.minimum_investment
              ? `${formatCurrency(offering.minimum_investment, { compact: true })} minimum`
              : null,
            terms?.target_hold_months
              ? `about ${Math.round(terms.target_hold_months / 12)} years`
              : null,
            raised !== null ? `${Math.round(raised)}% raised` : null,
            terms?.capital_position === 'preferred_equity' ? 'Preferred equity' : 'Common equity',
          ].filter(Boolean).join('  ·  ')}
        </p>
        {raised !== null ? <Progress className="mt-3 max-w-sm" value={raised} /> : null}
      </div>

      {/* The risk statement, as one line with the whole of it a tap away.
          It used to be a grey block of five lines at the top of every deal
          page, which is the surest way to make somebody stop reading risk
          warnings. The full text is below, and the acknowledgement that
          actually matters is in the ticket, at the moment it is load-bearing. */}
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Private investment: illiquid, projected rather than promised, and you can lose everything.{' '}
        <a href="#risks" className="text-accent underline underline-offset-2">Read the risks</a>
      </p>

      {!nda.accepted ? (
        <NdaGate offeringId={offeringId} nda={CURRENT_NDA} />
      ) : (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* ---- what it is ------------------------------------------------
              A paragraph, not a panel. This is the only thing on the page that
              is always open, because it is the only thing that answers "should
              I keep reading". */}
          {analysis ? <Thesis text={analysis.analysis.thesis} by={analysis.generatedBy} /> : null}

          {/* ---- what it could pay ----------------------------------------- */}
          <Fold
            title="Where the return comes from"
            meta={projection?.equityMultiple ? `${formatRatio(projection.equityMultiple)} over the hold` : undefined}
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
          </Fold>

          {/* ---- what could go wrong ---------------------------------------- */}
          {risk ? (
            <Fold
              id="risks"
              title="What could go wrong"
              meta={`${risk.overallScore} · ${risk.overallBand} risk`}
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
            </Fold>
          ) : null}

          {/* ---- the underlying record -------------------------------------- */}
          <Fold title="The property and the deal">
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
          </Fold>

          {/* ---- documents --------------------------------------------------- */}
          <Fold title="Documents" meta={documents.length > 0 ? `${documents.length}` : 'none released'}>
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
          </Fold>

          {/* ---- questions ----------------------------------------------------
              Folded like the rest. Asking a question is something an investor
              does after reading, not instead of it, and five suggested
              questions sitting open was the longest block on the page. */}
          <Fold title="Ask a question">
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
          </Fold>
        </div>

        {/* ---- the one action panel ------------------------------------------
            Ordered first on a phone. It used to sit after seven sections and
            3,200 pixels of scrolling, which made the primary action of the
            page the last thing anybody found. */}
        <div className="order-first lg:order-none">
          {environment !== 'live' ? (
            <PracticeTicket
              offeringId={offeringId}
              offeringName={offeringTitle(offering, deal, facility, revealIdentity)}
              minimum={offering.minimum_investment}
              maximum={offering.maximum_investment}
              availableCents={sandboxCents}
              status={offering.status}
              heldCents={sandboxHeldCents}
              holdYears={terms?.target_hold_months ? Math.round(terms.target_hold_months / 12) : null}
              structure={terms?.capital_position === 'preferred_equity' ? 'Preferred equity' : 'Common equity'}
              watching={sandboxWatching}
            />
          ) : (
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
          )}
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

/**
 * The opening paragraph, shortened to its opening.
 *
 * The analyst writes a full paragraph and all of it is worth having — but the
 * first two sentences say what the investment is, and the rest says how the
 * arithmetic got there. Leading with the whole thing put six lines of density
 * between the name of the deal and everything else on the page.
 */
function Thesis({ text, by }: { text: string; by: string }) {
  // Split on sentence ends, keeping the punctuation.
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text]
  const lead = sentences.slice(0, 2).join('').trim()
  const rest = sentences.slice(2).join('').trim()

  return (
    <div>
      <p className="text-[15px] leading-relaxed text-ink">{lead}</p>
      {rest ? (
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none text-[12px] text-accent hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">More on the numbers</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">{rest}</p>
        </details>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-muted">
        Written by the {by} analyst from the operator&rsquo;s own filings.
      </p>
    </div>
  )
}
