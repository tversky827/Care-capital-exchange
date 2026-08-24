import 'server-only'
import { db } from '@/db'
import { summarize, type UnderwritingSummary } from '@/lib/finance/calculations'
import type {
  Deal, Discrepancy, DocumentRecord, Facility, FacilityMetric, FinancialLineItem, FinancialPeriod,
  LineItemKey, Sponsor, TransactionTerms,
} from '@/types'

/**
 * The assembled, computed view of a deal.
 *
 * Every engine downstream — scoring, readiness, matching, the memo generator,
 * the AI analyst — reads a snapshot rather than querying the database itself.
 * That keeps a single definition of "what this deal's numbers are", so the
 * marketplace card, the credit memo and the match score can never disagree.
 */

export interface PeriodView {
  period: FinancialPeriod
  items: Partial<Record<LineItemKey, number | null>>
  /** Line items whose value came from extraction and is still unapproved. */
  pending: LineItemKey[]
}

export interface DealSnapshot {
  deal: Deal
  facility: Facility | null
  terms: TransactionTerms | null
  sponsor: Sponsor | null
  periods: PeriodView[]
  latest: PeriodView | null
  prior: PeriodView | null
  metrics: FacilityMetric | null
  metricHistory: FacilityMetric[]
  documents: DocumentRecord[]
  openDiscrepancies: Discrepancy[]
  summary: UnderwritingSummary
  /** Assumptions applied when the borrower has not stated loan terms. */
  assumedTerms: { ratePct: number; termMonths: number; amortizationMonths: number; assumed: boolean }
}

/**
 * Underwriting assumptions used when a borrower has not specified terms.
 *
 * These are stated openly in the UI wherever a metric depends on them, because
 * a DSCR computed on an assumed rate is a different claim from one computed on
 * a quoted rate.
 */
export const DEFAULT_UNDERWRITING_ASSUMPTIONS = {
  ratePct: 7.25,
  termMonths: 60,
  amortizationMonths: 300,
  managementFeePct: 5,
  replacementReservePerBed: 400,
} as const

/** Chooses the value of record for a line item: approved beats extracted. */
export function effectiveValue(item: FinancialLineItem): number | null {
  if (item.approved_value !== null) return item.approved_value
  return item.value
}

export async function buildSnapshot(dealId: string): Promise<DealSnapshot | null> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) return null

  const [facility, terms, sponsor, periodRows, lineItems, metricHistory, documents, discrepancies] =
    await Promise.all([
      store.selectOne('facilities', { where: { deal_id: dealId } }),
      store.selectOne('transaction_terms', { where: { deal_id: dealId } }),
      store.selectOne('sponsors', { where: { deal_id: dealId } }),
      store.select('financial_periods', { where: { deal_id: dealId }, orderBy: { field: 'end_date', dir: 'asc' } }),
      store.select('financial_line_items', { where: { deal_id: dealId } }),
      store.select('facility_metrics', { where: { deal_id: dealId }, orderBy: { field: 'period_end', dir: 'asc' } }),
      store.select('documents', { where: { deal_id: dealId, deleted_at: { isNull: true } }, orderBy: { field: 'created_at', dir: 'desc' } }),
      store.select('discrepancies', { where: { deal_id: dealId, status: 'open' } }),
    ])

  const byPeriod = new Map<string, FinancialLineItem[]>()
  for (const item of lineItems) {
    const list = byPeriod.get(item.period_id) ?? []
    list.push(item)
    byPeriod.set(item.period_id, list)
  }

  const periods: PeriodView[] = periodRows.map((period) => {
    const items: Partial<Record<LineItemKey, number | null>> = {}
    const pending: LineItemKey[] = []
    for (const item of byPeriod.get(period.id) ?? []) {
      items[item.key] = effectiveValue(item)
      if (item.approved_value === null && item.proposed_value !== null) pending.push(item.key)
    }
    return { period, items, pending }
  })

  // Historical periods drive underwriting; projections are shown but not used.
  const historical = periods.filter((p) => p.period.period_type !== 'projection')
  const latest = historical[historical.length - 1] ?? null
  const prior = historical[historical.length - 2] ?? null
  const metrics = metricHistory[metricHistory.length - 1] ?? null

  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const summary = summarize({
    loanAmount: terms?.requested_financing,
    purchasePrice: terms?.purchase_price,
    appraisedValue: terms?.appraised_value,
    existingDebt: terms?.existing_debt,
    sellerFinancing: terms?.seller_financing,
    cashEquity: terms?.cash_equity,
    closingCosts: terms?.estimated_closing_costs,
    capexRequirement: terms?.capex_requirement,
    workingCapitalRequirement: terms?.working_capital_requirement,
    ratePct: terms?.requested_rate_pct ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.ratePct,
    termMonths: terms?.requested_term_months ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.termMonths,
    amortizationMonths: terms?.requested_amortization_months ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.amortizationMonths,
    interestOnlyMonths: terms?.requested_io_months ?? 0,
    revenue: latest?.items.revenue ?? null,
    ebitda: latest?.items.ebitda ?? null,
    rent: latest?.items.rent ?? null,
    priorRevenue: prior?.items.revenue ?? null,
    priorEbitda: prior?.items.ebitda ?? null,
    beds,
    census: facility?.current_census ?? metrics?.average_census ?? null,
    managementFeePct: DEFAULT_UNDERWRITING_ASSUMPTIONS.managementFeePct,
    managementFeeCharged: latest?.items.management_fee ?? null,
    replacementReservePerBed: DEFAULT_UNDERWRITING_ASSUMPTIONS.replacementReservePerBed,
  })

  return {
    deal,
    facility,
    terms,
    sponsor,
    periods,
    latest,
    prior,
    metrics,
    metricHistory,
    documents,
    openDiscrepancies: discrepancies,
    summary,
    assumedTerms: {
      ratePct: terms?.requested_rate_pct ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.ratePct,
      termMonths: terms?.requested_term_months ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.termMonths,
      amortizationMonths: terms?.requested_amortization_months ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.amortizationMonths,
      assumed: terms?.requested_rate_pct === null || terms?.requested_rate_pct === undefined,
    },
  }
}

/**
 * A stable fingerprint of everything an underwriting run depends on. Used to
 * skip re-running analysis when nothing material has changed, which is the
 * main lever on AI cost.
 */
export function snapshotFingerprint(snapshot: DealSnapshot): string {
  const material = {
    terms: snapshot.terms && {
      price: snapshot.terms.purchase_price,
      loan: snapshot.terms.requested_financing,
      debt: snapshot.terms.existing_debt,
      appraisal: snapshot.terms.appraised_value,
      rate: snapshot.terms.requested_rate_pct,
      term: snapshot.terms.requested_term_months,
      amort: snapshot.terms.requested_amortization_months,
    },
    facility: snapshot.facility && {
      beds: snapshot.facility.licensed_beds,
      operating: snapshot.facility.operating_beds,
      census: snapshot.facility.current_census,
      state: snapshot.facility.state,
    },
    periods: snapshot.periods.map((p) => [p.period.label, p.items]),
    metrics: snapshot.metrics && [
      snapshot.metrics.occupancy_pct, snapshot.metrics.medicaid_pct,
      snapshot.metrics.medicare_pct, snapshot.metrics.private_pay_pct,
    ],
    sponsor: snapshot.sponsor && [
      snapshot.sponsor.years_in_healthcare, snapshot.sponsor.facilities_operated,
    ],
    documents: snapshot.documents.length,
  }
  // A short, order-stable digest is enough to detect material change.
  const json = JSON.stringify(material)
  let hash = 0
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0
  }
  return `fp_${(hash >>> 0).toString(36)}_${json.length}`
}
