import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Download, Eye, Lock } from 'lucide-react'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { dealContext, loadDealForActor, subjectOf } from '@/lib/access'
import { canSubmitIndication, canViewDealIdentity, ForbiddenError } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { currentMemo } from '@/services/memo'
import { latestRun } from '@/services/underwriting'
import { documentsVisibleToLender } from '@/services/documents'
import { recordLenderView } from '@/services/distribution'
import { lenderNotes } from '@/services/lenders'
import { threadsForDeal } from '@/services/messages'
import { matchDeal, BAND_LABELS } from '@/lib/matching/engine'
import { toMatchableBox, toMatchableDeal } from '@/services/matching'
import { displayName, displayLocation } from '@/lib/deal/display'
import {
  Alert, Badge, Card, CardBody, DefinitionList, EmptyState, Section, Table, Td, Th, Tr, type Tone,
} from '@/components/ui/primitives'
import { BarChart, DonutChart, ThresholdBar } from '@/components/charts'
import { MetricTile, SeverityBadge } from '@/components/deal/common'
import { IndicationForm } from './indication-form'
import { LenderNotes, PipelineControl, RequestInformation } from './lender-tools'
import { formatCurrency, formatDate, formatPercent, formatRatio, formatRelative, titleize } from '@/lib/utils/format'

/**
 * Lender deal room.
 *
 * Everything on this page is scoped by what this lender is entitled to see. A
 * marketplace browser gets the anonymised summary and the metrics; only a
 * lender the borrower distributed to gets the identity, the data room and the
 * ability to submit an indication.
 */
export default async function LenderDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()
  if (!actor.isLender && !actor.isAdmin) redirect(`/deals/${dealId}`)

  let access
  try {
    access = await loadDealForActor(actor, dealId)
  } catch (error) {
    if (error instanceof ForbiddenError) notFound()
    throw error
  }

  // Opening the deal is the engagement signal the borrower sees.
  if (actor.lender) await recordLenderView(dealId, actor.lender.id)

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const store = await db()
  const context = await dealContext(actor, dealId)
  const subject = subjectOf(actor)
  const canSeeIdentity = canViewDealIdentity(subject, snapshot.deal, context)
  const canIndicate = canSubmitIndication(subject, snapshot.deal, context)

  const [memo, run, documents, notes, threads, box, myIndication] = await Promise.all([
    currentMemo(dealId),
    latestRun(dealId),
    documentsVisibleToLender(dealId, actor),
    lenderNotes(actor, dealId),
    threadsForDeal(actor, dealId),
    actor.lender
      ? store.selectOne('lender_lending_boxes', { where: { lender_id: actor.lender.id } })
      : Promise.resolve(null),
    actor.lender
      ? store.selectOne('indications', {
          where: { deal_id: dealId, lender_id: actor.lender.id, status: { in: ['submitted', 'updated', 'selected'] } },
        })
      : Promise.resolve(null),
  ])

  const match = box ? matchDeal(toMatchableDeal(snapshot), toMatchableBox(box)) : null
  const { deal, facility, summary, metrics, periods } = snapshot
  const historical = periods.filter((period) => period.period.period_type !== 'projection')
  const discrepancies = snapshot.openDiscrepancies

  const BAND_TONE: Record<string, Tone> = {
    strong: 'positive', good: 'accent', possible: 'warning', outside_box: 'neutral',
  }

  return (
    <div className="space-y-4">
      {/* Header ------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/lender" className="text-[12px] text-ink-muted hover:text-ink">Opportunities</Link>
              <span className="text-[12px] text-ink-muted">/</span>
              <span className="tnum text-[12px] text-ink-secondary">{deal.reference}</span>
              {deal.is_demo ? <Badge tone="warning">Demo</Badge> : null}
              {!canSeeIdentity ? <Badge tone="neutral" className="gap-1"><Lock className="size-2.5" /> Identity withheld</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-[19px] font-semibold text-ink">
              {displayName(deal, facility, canSeeIdentity)}
            </h1>
            <p className="mt-0.5 text-[12px] text-ink-secondary">
              {titleize(deal.transaction_type)} · {titleize(deal.asset_type)} ·{' '}
              {displayLocation(facility, canSeeIdentity)}
              {facility?.licensed_beds ? ` · ${facility.licensed_beds} licensed beds` : ''}
            </p>
          </div>
          {match ? (
            <div className="text-right">
              <p className="tnum text-[24px] font-semibold leading-none text-ink">{match.score}%</p>
              <Badge tone={BAND_TONE[match.band] ?? 'neutral'} className="mt-1">{BAND_LABELS[match.band]}</Badge>
            </div>
          ) : null}
        </div>

        <dl className="data-grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Requested" value={formatCurrency(summary.loanAmount, { compact: true })} />
          <MetricTile label="LTV" value={formatPercent(summary.ltv)} />
          <MetricTile label="DSCR" value={formatRatio(summary.dscr)} />
          <MetricTile label="Debt yield" value={formatPercent(summary.debtYield)} />
          <MetricTile label="Underwritten NOI" value={formatCurrency(summary.noi, { compact: true })} />
          <MetricTile label="Occupancy" value={formatPercent(facility?.occupancy_pct ?? summary.occupancyPct)} />
        </dl>
      </Card>

      {access.viaMarketplaceOnly ? (
        <Alert tone="neutral" title="You are viewing a marketplace listing">
          The facility identity and the data room are released once the borrower distributes this
          opportunity to your institution. Use the request below to ask for access, or to ask a
          question about the deal.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {/* Fit against our own box ------------------------------------- */}
          {match && box ? (
            <Section
              title="Fit against your lending criteria"
              description="Computed against the box your institution publishes, not against a platform average."
            >
              <CardBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ThresholdBar label="Loan-to-value" value={summary.ltv} threshold={box.max_ltv_pct} unit="%" higherIsBetter={false} />
                  <ThresholdBar label="Debt service coverage" value={summary.dscr} threshold={box.min_dscr} unit="x" />
                  <ThresholdBar label="Debt yield" value={summary.debtYield} threshold={box.min_debt_yield_pct} unit="%" />
                  <ThresholdBar
                    label="Occupancy"
                    value={facility?.occupancy_pct ?? summary.occupancyPct}
                    threshold={box.min_occupancy_pct}
                    unit="%"
                  />
                </div>

                <div className="grid gap-x-6 gap-y-1.5 border-t border-line pt-3 sm:grid-cols-2">
                  {match.factors.map((factor) => (
                    <div key={factor.key} className="flex gap-2 text-[12px]">
                      <span className="mt-0.5 shrink-0">
                        {factor.status === 'pass' ? <span className="text-positive">✓</span>
                          : factor.status === 'concern' ? <span className="text-warning">⚠</span>
                          : factor.status === 'fail' ? <span className="text-critical">✕</span>
                          : <span className="text-ink-muted">○</span>}
                      </span>
                      <span className="min-w-0 leading-relaxed text-ink-secondary">{factor.detail}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Section>
          ) : null}

          {/* Financial performance --------------------------------------- */}
          {historical.length > 0 ? (
            <Section title="Financial performance">
              <CardBody>
                <BarChart
                  series={historical.map((period) => ({ label: period.period.label, value: period.items.revenue ?? null }))}
                  format={(value) => formatCurrency(value, { compact: true })}
                  height={110}
                />
              </CardBody>
              <Table>
                <thead>
                  <tr>
                    <Th>Line item</Th>
                    {historical.map((period) => <Th key={period.period.id} numeric>{period.period.label}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {(['revenue', 'labor_expense', 'agency_labor', 'rent', 'ebitda', 'net_income'] as const).map((key) => (
                    historical.some((period) => period.items[key] != null) ? (
                      <Tr key={key}>
                        <Td className={key === 'ebitda' || key === 'revenue' ? 'font-semibold text-ink' : 'text-ink-secondary'}>
                          {titleize(key)}
                        </Td>
                        {historical.map((period) => (
                          <Td key={period.period.id} numeric className={key === 'ebitda' || key === 'revenue' ? 'font-semibold' : ''}>
                            {formatCurrency(period.items[key] ?? null)}
                          </Td>
                        ))}
                      </Tr>
                    ) : null
                  ))}
                  <Tr className="bg-surface-sunken/50">
                    <Td className="font-semibold text-ink">EBITDA margin</Td>
                    {historical.map((period) => {
                      const margin = period.items.revenue && period.items.ebitda
                        ? (period.items.ebitda / period.items.revenue) * 100
                        : null
                      return <Td key={period.period.id} numeric className="font-semibold">{formatPercent(margin)}</Td>
                    })}
                  </Tr>
                </tbody>
              </Table>
            </Section>
          ) : null}

          {/* Credit memo -------------------------------------------------- */}
          {memo ? (
            <Section
              title="Credit memorandum"
              description={`Version ${memo.version.version} · ${formatDate(memo.version.created_at)}`}
              actions={
                <Link href={`/deals/${dealId}/memo/print`} target="_blank" className="text-[12px] text-accent hover:underline">
                  Print / PDF
                </Link>
              }
            >
              <div className="divide-y divide-line">
                {memo.version.sections.map((section) => (
                  <details key={section.key} className="group">
                    <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-medium text-ink marker:hidden hover:bg-surface-sunken">
                      <span className="flex items-center justify-between gap-3">
                        {section.title}
                        <span className="text-ink-muted transition-transform group-open:rotate-45">+</span>
                      </span>
                    </summary>
                    <div className="px-4 pb-4">
                      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-secondary">
                        {section.body}
                      </pre>
                      {section.citations.length > 0 ? (
                        <ul className="mt-3 space-y-0.5 border-t border-line pt-2">
                          {section.citations.map((citation) => (
                            <li key={citation.marker} className="text-[11px] text-ink-muted">
                              {citation.marker}{' '}
                              {citation.document_id && documents.some((document) => document.id === citation.document_id) ? (
                                <Link
                                  href={`/api/documents/${citation.document_id}/download?disposition=inline`}
                                  target="_blank"
                                  className="text-accent hover:underline"
                                >
                                  {citation.label}
                                </Link>
                              ) : (
                                citation.label
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Risks -------------------------------------------------------- */}
          {run?.analysis?.risks.length ? (
            <Section title="Identified risks" description="Prepared by the platform from the deal record, for your own underwriting.">
              <ul className="divide-y divide-line">
                {run.analysis.risks.map((risk, index) => (
                  <li key={`${risk.title}-${index}`} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={risk.severity} />
                      <Badge tone="neutral">{risk.category}</Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold text-ink">{risk.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{risk.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* Q&A ---------------------------------------------------------- */}
          {threads.length > 0 ? (
            <Section title="Your questions on this deal">
              <div className="divide-y divide-line">
                {threads.map(({ thread, messages }) => (
                  <div key={thread.id} className="px-4 py-3">
                    <p className="text-[13px] font-medium text-ink">{thread.subject}</p>
                    <ul className="mt-2 space-y-2">
                      {messages.map((message) => (
                        <li key={message.id} className="text-[12px] leading-relaxed">
                          <span className="font-medium text-ink">
                            {message.author_company_id === actor.company.id ? 'You' : 'Borrower'}
                          </span>
                          <span className="ml-1.5 text-ink-muted">{formatRelative(message.created_at)}</span>
                          <p className="mt-0.5 whitespace-pre-wrap text-ink-secondary">{message.body}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="space-y-4">
          {/* Indication --------------------------------------------------- */}
          {canIndicate ? (
            <IndicationForm
              dealId={dealId}
              requested={summary.loanAmount}
              noi={summary.noi}
              existing={myIndication ? {
                id: myIndication.id,
                loan_amount: myIndication.loan_amount,
                all_in_rate_pct: myIndication.all_in_rate_pct,
                term_months: myIndication.term_months,
                amortization_months: myIndication.amortization_months,
                interest_only_months: myIndication.interest_only_months,
                origination_fee_pct: myIndication.origination_fee_pct,
                recourse: myIndication.recourse,
                status: myIndication.status,
                version: myIndication.version,
              } : null}
              typical={box ? {
                rateLow: box.typical_rate_low_pct,
                rateHigh: box.typical_rate_high_pct,
                termMonths: box.typical_term_months,
                maxLtv: box.max_ltv_pct,
                minDscr: box.min_dscr,
              } : null}
            />
          ) : (
            <Alert tone="neutral" title="Submitting an indication requires access">
              This opportunity has not been distributed to your institution. Ask the borrower for
              access below, and you will be able to submit terms once they share it.
            </Alert>
          )}

          {context.distribution ? (
            <PipelineControl
              distributionId={context.distribution.id}
              stage={context.distribution.pipeline_stage}
            />
          ) : null}

          <RequestInformation dealId={dealId} />

          {actor.lender ? (
            <LenderNotes
              dealId={dealId}
              notes={notes.map((note) => ({ id: note.id, body: note.body, created_at: note.created_at }))}
            />
          ) : null}

          {/* Operating snapshot ------------------------------------------- */}
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

          <Section title="Sponsor">
            <CardBody>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Years in healthcare', value: snapshot.sponsor?.years_in_healthcare ?? '—' },
                  { label: 'Facilities operated', value: snapshot.sponsor?.facilities_operated ?? '—' },
                  { label: 'Beds managed', value: snapshot.sponsor?.beds_operated ?? '—' },
                  { label: 'States', value: snapshot.sponsor?.states_operated.join(', ') || '—' },
                  { label: 'Prior defaults', value: snapshot.sponsor?.prior_defaults ? 'Yes — disclosed' : 'None disclosed' },
                  { label: 'Acquisitions', value: snapshot.sponsor?.historical_acquisitions ?? '—' },
                ]}
              />
              {canSeeIdentity && snapshot.sponsor?.relevant_experience ? (
                <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
                  {snapshot.sponsor.relevant_experience}
                </p>
              ) : null}
            </CardBody>
          </Section>

          {/* Data room ---------------------------------------------------- */}
          <Section
            title="Data room"
            description={
              documents.length
                ? `${documents.length} document${documents.length === 1 ? '' : 's'} released to your institution.`
                : 'Documents are released once the borrower distributes this opportunity to you.'
            }
          >
            {documents.length === 0 ? (
              <EmptyState title="No documents available yet" />
            ) : (
              <ul className="divide-y divide-line">
                {documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-ink">{document.display_name}</span>
                      <span className="block text-[11px] text-ink-muted">{titleize(document.doc_type)}</span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <Link
                        href={`/api/documents/${document.id}/download?disposition=inline`}
                        target="_blank"
                        className="text-ink-muted hover:text-accent"
                        aria-label={`View ${document.display_name}`}
                      >
                        <Eye className="size-3.5" />
                      </Link>
                      <Link
                        href={`/api/documents/${document.id}/download`}
                        className="text-ink-muted hover:text-accent"
                        aria-label={`Download ${document.display_name}`}
                      >
                        <Download className="size-3.5" />
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {discrepancies.length > 0 ? (
            <Section
              title={`Open items (${discrepancies.length})`}
              description="Disclosed by the platform rather than left for you to find."
            >
              <ul className="divide-y divide-line">
                {discrepancies.map((item) => (
                  <li key={item.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={item.severity} />
                      <span className="text-[12px] font-medium text-ink">{item.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-secondary">{item.description}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
