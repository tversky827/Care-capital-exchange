import type { DiscrepancyFinding } from '@/lib/ai/schemas'
import { growthPct, margin } from '@/lib/finance/calculations'
import type { DealSnapshot } from '@/lib/deal/snapshot'
import type { DocumentType, ExtractedField } from '@/types'

/**
 * Reconciliation.
 *
 * Compares every source of truth on a deal against every other one and reports
 * conflicts rather than resolving them. The rule the whole product rests on:
 * when two documents disagree, the platform never silently picks a winner. It
 * raises a discrepancy, states both values with their sources, and asks the
 * borrower — because a lender who later finds the conflict themselves will
 * assume the borrower was hiding it.
 *
 * Every detector is deterministic and carries a stable `detector_key`, so
 * re-running reconciliation updates existing findings instead of duplicating
 * them, and a resolved finding does not reappear unless the data changes back.
 */

export interface ReconciliationSource extends ExtractedField {
  documentName: string
}

export interface ReconcileInput {
  snapshot: DealSnapshot
  extracted: ReconciliationSource[]
}

/** Relative tolerance before two figures for the same fact are a conflict. */
const MATERIALITY = {
  revenue: 0.02,
  ebitda: 0.03,
  debt: 0.01,
  price: 0.005,
  occupancy: 2, // percentage points
  payerMixSum: 1.5, // percentage points
}

const REQUIRED_DOCUMENTS: { type: DocumentType; label: string; severity: DiscrepancyFinding['severity'] }[] = [
  { type: 'profit_and_loss', label: 'Trailing operating statements (P&L)', severity: 'critical' },
  { type: 'balance_sheet', label: 'Balance sheet', severity: 'high' },
  { type: 'census', label: 'Census and occupancy detail', severity: 'high' },
  { type: 'payer_mix', label: 'Payer mix detail', severity: 'high' },
  { type: 'tax_return', label: 'Business tax returns', severity: 'medium' },
  { type: 'ar_aging', label: 'Accounts receivable aging', severity: 'medium' },
  { type: 'existing_debt', label: 'Current debt schedule', severity: 'medium' },
]

const ACQUISITION_DOCUMENTS: { type: DocumentType; label: string; severity: DiscrepancyFinding['severity'] }[] = [
  { type: 'purchase_agreement', label: 'Executed purchase agreement', severity: 'high' },
  { type: 'appraisal', label: 'Appraisal', severity: 'medium' },
]

function relativeGap(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale === 0 ? 0 : Math.abs(a - b) / scale
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function reconcile(input: ReconcileInput): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const { snapshot, extracted } = input

  findings.push(...detectCrossDocumentConflicts(extracted))
  findings.push(...detectStatementVsRecord(snapshot, extracted))
  findings.push(...detectOperatingConsistency(snapshot))
  findings.push(...detectTrendAnomalies(snapshot))
  findings.push(...detectStructuralIssues(snapshot))
  findings.push(...detectMissingDocuments(snapshot))

  return findings
}

/**
 * Two documents reporting different values for the same figure and period.
 * This is the highest-signal finding the platform produces.
 */
function detectCrossDocumentConflicts(extracted: ReconciliationSource[]): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const watched: { field: string; label: string; tolerance: number; category: DiscrepancyFinding['category'] }[] = [
    { field: 'revenue', label: 'Revenue', tolerance: MATERIALITY.revenue, category: 'revenue' },
    { field: 'ebitda', label: 'EBITDA', tolerance: MATERIALITY.ebitda, category: 'ebitda' },
    { field: 'net_income', label: 'Net income', tolerance: MATERIALITY.ebitda, category: 'ebitda' },
    { field: 'existing_debt', label: 'Outstanding debt', tolerance: MATERIALITY.debt, category: 'debt' },
    { field: 'purchase_price', label: 'Purchase price', tolerance: MATERIALITY.price, category: 'dates' },
  ]

  for (const { field, label, tolerance, category } of watched) {
    const byPeriod = new Map<string, ReconciliationSource[]>()
    for (const row of extracted) {
      if (row.field_name !== field || row.normalized_value === null) continue
      if (row.review_status === 'rejected' || row.review_status === 'superseded') continue
      const key = row.year ? String(row.year) : (row.period ?? 'unspecified')
      const list = byPeriod.get(key) ?? []
      list.push(row)
      byPeriod.set(key, list)
    }

    for (const [period, rows] of byPeriod) {
      // Only a conflict when the values came from *different* documents.
      const distinctDocuments = new Set(rows.map((r) => r.document_id ?? 'manual'))
      if (distinctDocuments.size < 2) continue

      const values = rows.map((r) => r.normalized_value!)
      const min = Math.min(...values)
      const max = Math.max(...values)
      if (relativeGap(min, max) <= tolerance) continue

      const low = rows.find((r) => r.normalized_value === min)!
      const high = rows.find((r) => r.normalized_value === max)!
      const gapPct = (relativeGap(min, max) * 100).toFixed(1)

      findings.push({
        detector_key: `conflict:${field}:${period}`,
        category,
        severity: relativeGap(min, max) > tolerance * 4 ? 'critical' : 'high',
        title: `${label} for ${period} differs between documents`,
        description: `${label} is reported as ${money(max)} in ${high.documentName} and ${money(min)} in ${low.documentName} — a ${gapPct}% difference.`,
        ai_explanation:
          `Lenders reconcile operating statements against tax returns and third-party reports as a matter of course. A ${gapPct}% variance on ${label.toLowerCase()} will be found in diligence, so it is better explained up front. Common benign causes are a different fiscal period, an accrual-versus-cash presentation, or an add-back that appears in one document but not the other.`,
        suggested_question: `Which ${label.toLowerCase()} figure for ${period} should be treated as the underwriting number, and what accounts for the difference between the two documents?`,
        document_ids: [...new Set(rows.map((r) => r.document_id).filter((id): id is string => Boolean(id)))],
        conflicting_values: rows
          .filter((r, i, all) => all.findIndex((o) => o.normalized_value === r.normalized_value) === i)
          .map((r) => ({
            label: `${label} (${period})`,
            value: money(r.normalized_value!),
            source: r.documentName,
          })),
      })
    }
  }
  return findings
}

/** A figure the borrower typed disagreeing with a figure a document states. */
function detectStatementVsRecord(snapshot: DealSnapshot, extracted: ReconciliationSource[]): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const terms = snapshot.terms
  if (!terms) return findings

  const checks: {
    field: string
    stated: number | null
    label: string
    tolerance: number
    category: DiscrepancyFinding['category']
  }[] = [
    { field: 'purchase_price', stated: terms.purchase_price, label: 'Purchase price', tolerance: MATERIALITY.price, category: 'dates' },
    { field: 'existing_debt', stated: terms.existing_debt, label: 'Existing debt balance', tolerance: MATERIALITY.debt, category: 'debt' },
    { field: 'appraised_value', stated: terms.appraised_value, label: 'Appraised value', tolerance: MATERIALITY.price, category: 'dates' },
  ]

  for (const check of checks) {
    if (check.stated === null) continue
    const source = extracted.find(
      (r) => r.field_name === check.field && r.normalized_value !== null && r.review_status !== 'rejected',
    )
    if (!source?.normalized_value) continue
    if (relativeGap(check.stated, source.normalized_value) <= check.tolerance) continue

    findings.push({
      detector_key: `stated_vs_document:${check.field}`,
      category: check.category,
      severity: 'high',
      title: `${check.label} entered on the deal differs from the supporting document`,
      description: `The deal record states ${money(check.stated)} while ${source.documentName} states ${money(source.normalized_value)}.`,
      ai_explanation: `The figure carried on the deal drives every calculated metric — LTV, loan-to-cost and the sources and uses. If the document is the correct figure, the metrics currently shown to lenders are wrong.`,
      suggested_question: `Should ${check.label.toLowerCase()} be updated to ${money(source.normalized_value)} to match ${source.documentName}?`,
      document_ids: source.document_id ? [source.document_id] : [],
      conflicting_values: [
        { label: `${check.label} (entered)`, value: money(check.stated), source: 'Deal record' },
        { label: `${check.label} (document)`, value: money(source.normalized_value), source: source.documentName },
      ],
    })
  }
  return findings
}

function detectOperatingConsistency(snapshot: DealSnapshot): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const facility = snapshot.facility
  const metrics = snapshot.metrics

  // Census above licensed capacity is impossible, so one of the two is wrong.
  if (facility?.current_census && facility.licensed_beds && facility.current_census > facility.licensed_beds) {
    findings.push({
      detector_key: 'census_exceeds_licensed_beds',
      category: 'census',
      severity: 'critical',
      title: 'Current census exceeds licensed bed count',
      description: `Census of ${facility.current_census} is higher than the ${facility.licensed_beds} licensed beds reported for the facility.`,
      ai_explanation: 'A facility cannot operate above its licensed capacity. Either the census figure includes a unit that is not part of this license, or the licensed bed count is understated.',
      suggested_question: `Please confirm the licensed bed count and the current census — the two figures on file are not reconcilable.`,
      document_ids: [],
      conflicting_values: [
        { label: 'Current census', value: String(facility.current_census), source: 'Deal record' },
        { label: 'Licensed beds', value: String(facility.licensed_beds), source: 'Deal record' },
      ],
    })
  }

  // Occupancy stated on the deal versus occupancy in the census report.
  if (facility?.occupancy_pct != null && metrics?.occupancy_pct != null) {
    const gap = Math.abs(facility.occupancy_pct - metrics.occupancy_pct)
    if (gap > MATERIALITY.occupancy) {
      findings.push({
        detector_key: 'occupancy_mismatch',
        category: 'occupancy',
        severity: gap > 8 ? 'high' : 'medium',
        title: 'Stated occupancy differs from the census detail',
        description: `The deal states ${facility.occupancy_pct.toFixed(1)}% occupancy while the census detail for ${metrics.period_label} shows ${metrics.occupancy_pct.toFixed(1)}%.`,
        ai_explanation: 'Occupancy drives both revenue durability and the lender\'s stabilised cash-flow view. A gap of more than two points usually means one figure is a point-in-time snapshot and the other is a period average.',
        suggested_question: 'Is the occupancy figure on the deal a point-in-time census or a period average, and which period does it cover?',
        document_ids: [],
        conflicting_values: [
          { label: 'Occupancy (deal)', value: `${facility.occupancy_pct.toFixed(1)}%`, source: 'Deal record' },
          { label: `Occupancy (${metrics.period_label})`, value: `${metrics.occupancy_pct.toFixed(1)}%`, source: 'Census detail' },
        ],
      })
    }
  }

  // Payer mix that does not sum to 100% means a category is missing.
  if (metrics) {
    const parts = [
      metrics.medicare_pct, metrics.medicaid_pct, metrics.private_pay_pct,
      metrics.managed_care_pct, metrics.other_payer_pct,
    ].filter((v): v is number => v !== null)
    if (parts.length >= 3) {
      const total = parts.reduce((a, b) => a + b, 0)
      if (Math.abs(total - 100) > MATERIALITY.payerMixSum) {
        findings.push({
          detector_key: 'payer_mix_does_not_sum',
          category: 'payer_mix',
          severity: 'medium',
          title: 'Payer mix does not total 100%',
          description: `The reported payer categories total ${total.toFixed(1)}% for ${metrics.period_label}.`,
          ai_explanation: 'An incomplete payer mix makes the revenue quality analysis unreliable, and Medicaid concentration is the single metric most lenders screen on first.',
          suggested_question: `Which payer category accounts for the remaining ${(100 - total).toFixed(1)}% of ${metrics.period_label} revenue?`,
          document_ids: [],
          conflicting_values: [
            { label: 'Payer mix total', value: `${total.toFixed(1)}%`, source: metrics.period_label },
            { label: 'Expected', value: '100.0%', source: 'Platform check' },
          ],
        })
      }
    }
  }
  return findings
}

function detectTrendAnomalies(snapshot: DealSnapshot): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const { latest, prior } = snapshot
  if (!latest || !prior) return findings

  const revenueGrowth = growthPct(latest.items.revenue, prior.items.revenue)
  if (revenueGrowth !== null && Math.abs(revenueGrowth) > 20) {
    findings.push({
      detector_key: 'revenue_swing',
      category: 'unexpected_change',
      severity: Math.abs(revenueGrowth) > 35 ? 'high' : 'medium',
      title: `Revenue moved ${revenueGrowth > 0 ? 'up' : 'down'} ${Math.abs(revenueGrowth).toFixed(1)}% year over year`,
      description: `Revenue changed from ${money(prior.items.revenue!)} in ${prior.period.label} to ${money(latest.items.revenue!)} in ${latest.period.label}.`,
      ai_explanation: 'A swing of this size is the first thing a credit committee will ask about. Rate changes, a census recovery, a payer mix shift and a one-time settlement all produce this pattern and are underwritten very differently.',
      suggested_question: `What drove the ${Math.abs(revenueGrowth).toFixed(1)}% revenue change between ${prior.period.label} and ${latest.period.label}, and is it recurring?`,
      document_ids: [],
      conflicting_values: [
        { label: `Revenue (${prior.period.label})`, value: money(prior.items.revenue!), source: 'Operating statements' },
        { label: `Revenue (${latest.period.label})`, value: money(latest.items.revenue!), source: 'Operating statements' },
      ],
    })
  }

  const ebitdaGrowth = growthPct(latest.items.ebitda, prior.items.ebitda)
  if (ebitdaGrowth !== null && ebitdaGrowth < -25) {
    findings.push({
      detector_key: 'ebitda_decline',
      category: 'ebitda',
      severity: ebitdaGrowth < -40 ? 'critical' : 'high',
      title: `EBITDA declined ${Math.abs(ebitdaGrowth).toFixed(1)}% year over year`,
      description: `EBITDA fell from ${money(prior.items.ebitda!)} in ${prior.period.label} to ${money(latest.items.ebitda!)} in ${latest.period.label}.`,
      ai_explanation: 'Declining cash flow into a financing is the hardest pattern to place. Lenders will want to know whether the trailing twelve months or the most recent quarter annualised is the right basis for sizing.',
      suggested_question: `What caused the EBITDA decline in ${latest.period.label}, and what has changed since?`,
      document_ids: [],
      conflicting_values: [
        { label: `EBITDA (${prior.period.label})`, value: money(prior.items.ebitda!), source: 'Operating statements' },
        { label: `EBITDA (${latest.period.label})`, value: money(latest.items.ebitda!), source: 'Operating statements' },
      ],
    })
  }

  // An EBITDA margin far outside the range skilled nursing produces usually
  // means the statements are facility-level with rent or management excluded.
  const latestMargin = margin(latest.items.ebitda, latest.items.revenue)
  if (latestMargin !== null && snapshot.deal.asset_type === 'snf' && (latestMargin > 30 || latestMargin < 0)) {
    findings.push({
      detector_key: 'ebitda_margin_outlier',
      category: 'ebitda',
      severity: 'medium',
      title: `EBITDA margin of ${latestMargin.toFixed(1)}% is outside the normal skilled nursing range`,
      description: `${latest.period.label} EBITDA margin computes to ${latestMargin.toFixed(1)}%, against a typical range of roughly 8% to 20% for skilled nursing operations.`,
      ai_explanation: latestMargin > 30
        ? 'A margin this high normally indicates the statement excludes rent, management fees or an allocated corporate overhead. Lenders will re-underwrite with those costs imputed.'
        : 'A negative margin means the operation is not currently covering its operating costs, which changes the financing from a cash-flow loan to an asset-based or turnaround structure.',
      suggested_question: 'Do the operating statements include facility rent, management fees and corporate allocations? If not, what would those add?',
      document_ids: [],
      conflicting_values: [
        { label: 'EBITDA margin', value: `${latestMargin.toFixed(1)}%`, source: latest.period.label },
        { label: 'Typical SNF range', value: '8% – 20%', source: 'Platform benchmark' },
      ],
    })
  }

  const agencyNow = latest.items.agency_labor
  const agencyPrior = prior.items.agency_labor
  const agencyGrowth = growthPct(agencyNow, agencyPrior)
  if (agencyGrowth !== null && agencyGrowth > 40 && (agencyNow ?? 0) > 0) {
    findings.push({
      detector_key: 'agency_labor_spike',
      category: 'unexpected_change',
      severity: 'medium',
      title: `Agency labor increased ${agencyGrowth.toFixed(0)}% year over year`,
      description: `Agency labor rose from ${money(agencyPrior!)} to ${money(agencyNow!)}.`,
      ai_explanation: 'Agency reliance is the clearest indicator of a staffing problem, and it compresses margin quickly. Lenders treat a rising agency line as a forward risk to the cash flow they are sizing against.',
      suggested_question: 'What is driving agency use, and what is the plan and timeline to convert agency hours to permanent staff?',
      document_ids: [],
      conflicting_values: [
        { label: `Agency labor (${prior.period.label})`, value: money(agencyPrior!), source: 'Operating statements' },
        { label: `Agency labor (${latest.period.label})`, value: money(agencyNow!), source: 'Operating statements' },
      ],
    })
  }

  return findings
}

function detectStructuralIssues(snapshot: DealSnapshot): DiscrepancyFinding[] {
  const findings: DiscrepancyFinding[] = []
  const { terms, summary } = snapshot

  // An appraisal below the contract price caps proceeds and is often the
  // single fact that reshapes a transaction.
  if (terms?.appraised_value && terms.purchase_price && terms.appraised_value < terms.purchase_price * 0.97) {
    const gap = terms.purchase_price - terms.appraised_value
    findings.push({
      detector_key: 'appraisal_below_price',
      category: 'dates',
      severity: 'high',
      title: 'Appraised value is below the purchase price',
      description: `The appraisal of ${money(terms.appraised_value)} is ${money(gap)} below the ${money(terms.purchase_price)} purchase price.`,
      ai_explanation: 'Lenders size to the lesser of cost and value, so the appraisal — not the contract — sets maximum proceeds here. The gap has to be covered with additional equity or a price adjustment.',
      suggested_question: `How will the ${money(gap)} gap between appraised value and purchase price be covered?`,
      document_ids: [],
      conflicting_values: [
        { label: 'Purchase price', value: money(terms.purchase_price), source: 'Deal record' },
        { label: 'Appraised value', value: money(terms.appraised_value), source: 'Appraisal' },
      ],
    })
  }

  if (!summary.sourcesAndUses.balanced && summary.sourcesAndUses.totalUses > 0 && terms?.cash_equity != null) {
    const gap = summary.sourcesAndUses.gap
    findings.push({
      detector_key: 'sources_uses_imbalance',
      category: 'other',
      severity: 'high',
      title: 'Sources and uses do not balance',
      description: `Sources total ${money(summary.sourcesAndUses.totalSources)} against uses of ${money(summary.sourcesAndUses.totalUses)}, leaving a ${money(Math.abs(gap))} ${gap < 0 ? 'shortfall' : 'surplus'}.`,
      ai_explanation: 'A capital stack that does not balance is the first thing a credit analyst checks. The shortfall has to be resolved with equity, seller financing, or a change in the requested loan amount before the package goes out.',
      suggested_question: `How is the ${money(Math.abs(gap))} ${gap < 0 ? 'shortfall' : 'surplus'} in the capital stack accounted for?`,
      document_ids: [],
      conflicting_values: [
        { label: 'Total sources', value: money(summary.sourcesAndUses.totalSources), source: 'Deal record' },
        { label: 'Total uses', value: money(summary.sourcesAndUses.totalUses), source: 'Deal record' },
      ],
    })
  }

  // Stale financials: lenders generally want statements within 90–120 days.
  if (snapshot.latest) {
    const ageDays = Math.floor(
      (Date.now() - new Date(snapshot.latest.period.end_date).getTime()) / 86_400_000,
    )
    if (ageDays > 180) {
      findings.push({
        detector_key: 'stale_financials',
        category: 'dates',
        severity: ageDays > 365 ? 'high' : 'medium',
        title: `Most recent financial period ended ${Math.floor(ageDays / 30)} months ago`,
        description: `The latest period on file is ${snapshot.latest.period.label}, ending ${snapshot.latest.period.end_date.slice(0, 10)}.`,
        ai_explanation: 'Most lenders require operating statements no more than 90 to 120 days old before issuing an indication, and will re-underwrite on updated statements at closing.',
        suggested_question: 'Can you provide interim operating statements through the most recently closed month?',
        document_ids: [],
        conflicting_values: [
          { label: 'Latest period end', value: snapshot.latest.period.end_date.slice(0, 10), source: 'Financial statements' },
          { label: 'Typical lender requirement', value: 'Within 90–120 days', source: 'Platform benchmark' },
        ],
      })
    }
  }

  return findings
}

function detectMissingDocuments(snapshot: DealSnapshot): DiscrepancyFinding[] {
  const present = new Set(snapshot.documents.map((d) => d.doc_type))
  const isAcquisition = ['acquisition', 'acquisition_refinance'].includes(snapshot.deal.transaction_type)
  const required = [...REQUIRED_DOCUMENTS, ...(isAcquisition ? ACQUISITION_DOCUMENTS : [])]

  return required
    .filter((doc) => !present.has(doc.type))
    .map((doc) => ({
      detector_key: `missing_document:${doc.type}`,
      category: 'missing_document' as const,
      severity: doc.severity,
      title: `${doc.label} not yet provided`,
      description: `No document categorised as ${doc.label.toLowerCase()} has been uploaded to this deal.`,
      ai_explanation: `Substantially every lender on the platform requires ${doc.label.toLowerCase()} before issuing an indication. Providing it before distribution avoids a round trip that typically costs a week.`,
      suggested_question: `Please upload ${doc.label.toLowerCase()}.`,
      document_ids: [],
      conflicting_values: [],
    }))
}
