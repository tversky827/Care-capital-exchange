import { describe, expect, it } from 'vitest'
import { assessReadiness, DISTRIBUTION_THRESHOLD } from '@/lib/underwriting/readiness'
import { scoreDeal, SCORE_WEIGHTS, scoreBand } from '@/lib/underwriting/score'
import { reconcile } from '@/lib/underwriting/reconcile'
import { analyzeDeal } from '@/lib/ai/local/analysis'
import { creditAnalysisSchema, reconciliationResultSchema } from '@/lib/ai/schemas'
import { summarize } from '@/lib/finance/calculations'
import type { DealSnapshot, PeriodView } from '@/lib/deal/snapshot'
import type { Deal, DocumentRecord, DocumentType, ExtractedField, Facility, FacilityMetric, TransactionTerms } from '@/types'

const NOW = '2026-01-15T00:00:00.000Z'

function period(label: string, year: number, items: Record<string, number | null>): PeriodView {
  return {
    period: {
      id: `p-${label}`, deal_id: 'deal-1', label, period_type: 'annual', fiscal_year: year,
      start_date: `${year}-01-01`, end_date: `${year}-12-31`, source: 'manual',
      is_primary: false, created_at: NOW,
    },
    items: items as PeriodView['items'],
    pending: [],
  }
}

function makeDocument(type: DocumentType, id = type): DocumentRecord {
  return {
    id, deal_id: 'deal-1', company_id: 'co-1', category: 'financial', doc_type: type,
    filename: `${type}.pdf`, display_name: type, mime_type: 'application/pdf', size_bytes: 10,
    storage_key: 'k', checksum: 'c', uploaded_by: 'u1', version: 1, current_version_id: null,
    processing_status: 'processed', extraction_status: 'complete', page_count: 1,
    malware_scan: 'clean', visibility: 'distributed_lenders', notes: null, is_demo: false,
    deleted_at: null, created_at: NOW, updated_at: NOW,
  }
}

const REQUIRED_DOCS: DocumentType[] = [
  'profit_and_loss', 'balance_sheet', 'census', 'payer_mix', 'tax_return',
  'ar_aging', 'existing_debt', 'license', 'purchase_agreement', 'appraisal',
]

function makeSnapshot(overrides: Partial<DealSnapshot> = {}): DealSnapshot {
  const deal: Deal = {
    id: 'deal-1', reference: 'CCX-1001', company_id: 'co-1', created_by: 'u1',
    name: 'Test Facility', asset_type: 'snf', transaction_type: 'acquisition',
    status: 'underwriting', distribution_scope: 'private', anonymize_in_marketplace: true,
    borrower_priority: 'lowest_rate', target_close_date: null, narrative: null, is_demo: false,
    distributed_at: null, created_at: NOW, updated_at: NOW,
  }

  const facility: Facility = {
    id: 'f-1', deal_id: 'deal-1', name: 'Test Facility', address_line1: '1 Road', city: 'Peoria',
    state: 'IL', zip: '61601', county: 'Peoria', licensed_beds: 120, certified_beds: 120,
    operating_beds: 120, current_census: 104, occupancy_pct: 86.7,
    ownership_structure: 'LLC', year_built: 1995, last_renovation_year: 2019,
    property_type: 'SNF', real_estate_included: true, operating_company: 'Op LLC',
    management_company: null, cms_star_rating: 4, created_at: NOW, updated_at: NOW,
  }

  const terms: TransactionTerms = {
    id: 't-1', deal_id: 'deal-1', purchase_price: 14_000_000, requested_financing: 10_500_000,
    existing_debt: null, seller_financing: null, cash_equity: null, appraised_value: 14_200_000,
    estimated_closing_costs: 420_000, working_capital_requirement: null, capex_requirement: null,
    target_close_date: '2026-04-01T00:00:00.000Z', purchase_agreement_status: 'Executed',
    loi_status: null, requested_term_months: 60, requested_amortization_months: 300,
    requested_rate_pct: 7.25, requested_io_months: 12, created_at: NOW, updated_at: NOW,
  }

  const metrics: FacilityMetric = {
    id: 'm-1', facility_id: 'f-1', deal_id: 'deal-1', period_label: '2025',
    period_end: '2025-12-31', occupancy_pct: 86.7, average_census: 104, medicare_pct: 16,
    medicaid_pct: 58, private_pay_pct: 12, managed_care_pct: 12, other_payer_pct: 2,
    average_daily_rate: 485, revenue_per_patient_day: 485,
    labor_hours_per_patient_day: 3.4, agency_labor_pct: 6, created_at: NOW,
  }

  const prior = period('2024', 2024, { revenue: 17_200_000, ebitda: 2_450_000, labor_expense: 9_400_000, agency_labor: 700_000 })
  const latest = period('2025', 2025, { revenue: 18_400_000, ebitda: 2_710_000, labor_expense: 10_000_000, agency_labor: 610_000 })

  const summary = summarize({
    loanAmount: 10_500_000, purchasePrice: 14_000_000, appraisedValue: 14_200_000,
    closingCosts: 420_000, ratePct: 7.25, termMonths: 60, amortizationMonths: 300,
    interestOnlyMonths: 12, revenue: 18_400_000, ebitda: 2_710_000,
    priorRevenue: 17_200_000, priorEbitda: 2_450_000, beds: 120, census: 104,
    managementFeePct: 5, replacementReservePerBed: 400,
  })

  return {
    deal, facility, terms, sponsor: {
      id: 's-1', deal_id: 'deal-1', legal_entity: 'Sponsor LLC', years_in_healthcare: 14,
      years_operating_asset_type: 12, facilities_operated: 6, beds_operated: 700,
      states_operated: ['IL'], historical_acquisitions: 8, previous_exits: 2,
      prior_defaults: false, bankruptcy_history: false, management_team: 'Team',
      key_executives: null, net_worth: 30_000_000, liquidity: 8_000_000,
      relevant_experience: 'Experience', created_at: NOW, updated_at: NOW,
    },
    periods: [prior, latest], latest, prior, metrics, metricHistory: [metrics],
    documents: REQUIRED_DOCS.map((type) => makeDocument(type)),
    openDiscrepancies: [], summary,
    assumedTerms: { ratePct: 7.25, termMonths: 60, amortizationMonths: 300, assumed: false },
    ...overrides,
  }
}

describe('deal score', () => {
  it('publishes six components whose weights sum to one', () => {
    const score = scoreDeal(makeSnapshot())
    expect(score.components).toHaveLength(6)
    expect(score.components.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 6)
    expect(Object.keys(SCORE_WEIGHTS)).toHaveLength(6)
  })

  it('scores a complete, well-performing deal well', () => {
    const score = scoreDeal(makeSnapshot())
    expect(score.overall).toBeGreaterThan(60)
    expect(score.confidence).toBeGreaterThan(0.6)
    expect(scoreBand(score.overall).tone).not.toBe('weak')
  })

  it('never reports high confidence on a deal with no data', () => {
    const empty = makeSnapshot({
      facility: null, terms: null, sponsor: null, metrics: null, metricHistory: [],
      periods: [], latest: null, prior: null, documents: [],
      summary: summarize({}),
    })
    const score = scoreDeal(empty)
    expect(score.confidence).toBeLessThan(0.5)
    expect(score.components.filter((c) => c.data_quality === 'missing').length).toBeGreaterThan(2)
    // A component with no data scores neutrally rather than badly or well.
    for (const component of score.components) {
      if (component.data_quality === 'missing' && component.key !== 'data_quality') {
        expect(component.score).toBe(50)
      }
    }
  })

  it('penalises a deal with open discrepancies through data quality', () => {
    const withIssues = makeSnapshot({
      openDiscrepancies: [{
        id: 'd1', deal_id: 'deal-1', severity: 'high', category: 'revenue', title: 'Conflict',
        description: 'x', ai_explanation: null, suggested_question: null, document_ids: [],
        conflicting_values: [], status: 'open', detector_key: 'k', created_at: NOW, updated_at: NOW,
      }],
    })
    expect(scoreDeal(withIssues).overall).toBeLessThan(scoreDeal(makeSnapshot()).overall)
  })
})

describe('deal readiness', () => {
  const context = { hasUnderwritingRun: true, hasCreditMemo: true }

  it('clears a complete deal for distribution', () => {
    const readiness = assessReadiness(makeSnapshot(), context)
    expect(readiness.overall).toBeGreaterThanOrEqual(DISTRIBUTION_THRESHOLD)
    expect(readiness.requiredOutstanding).toHaveLength(0)
    expect(readiness.canDistribute).toBe(true)
    expect(readiness.dimensions).toHaveLength(4)
  })

  it('blocks distribution while a required document is missing', () => {
    const snapshot = makeSnapshot({
      documents: REQUIRED_DOCS.filter((type) => type !== 'profit_and_loss').map((type) => makeDocument(type)),
    })
    const readiness = assessReadiness(snapshot, context)
    expect(readiness.canDistribute).toBe(false)
    expect(readiness.requiredOutstanding.some((item) => item.key === 'doc_pl')).toBe(true)
    expect(readiness.blockingReason).toMatch(/required item/)
  })

  it('blocks distribution while analysis or the memo is missing', () => {
    expect(assessReadiness(makeSnapshot(), { hasUnderwritingRun: false, hasCreditMemo: false }).canDistribute).toBe(false)
    expect(assessReadiness(makeSnapshot(), { hasUnderwritingRun: true, hasCreditMemo: false }).canDistribute).toBe(false)
  })

  it('blocks distribution while a high-severity item is unresolved', () => {
    const snapshot = makeSnapshot({
      openDiscrepancies: [{
        id: 'd1', deal_id: 'deal-1', severity: 'critical', category: 'revenue', title: 'Conflict',
        description: 'x', ai_explanation: null, suggested_question: null, document_ids: [],
        conflicting_values: [], status: 'open', detector_key: 'k', created_at: NOW, updated_at: NOW,
      }],
    })
    const readiness = assessReadiness(snapshot, context)
    expect(readiness.canDistribute).toBe(false)
    expect(readiness.requiredOutstanding.some((item) => item.key === 'discrepancies')).toBe(true)
  })

  it('blocks distribution while extracted values await approval', () => {
    const snapshot = makeSnapshot()
    snapshot.periods[1]!.pending = ['revenue']
    const readiness = assessReadiness(snapshot, context)
    expect(readiness.canDistribute).toBe(false)
    expect(readiness.requiredOutstanding.some((item) => item.key === 'reviewed_extractions')).toBe(true)
  })

  it('does not demand a purchase price on a refinance', () => {
    const snapshot = makeSnapshot()
    snapshot.deal.transaction_type = 'refinance'
    snapshot.terms!.purchase_price = null
    const readiness = assessReadiness(snapshot, context)
    expect(readiness.requiredOutstanding.some((item) => item.key === 'transaction_terms')).toBe(false)
  })

  it('gives every outstanding item somewhere to go', () => {
    const bare = makeSnapshot({ documents: [], metrics: null, metricHistory: [], sponsor: null })
    const readiness = assessReadiness(bare, { hasUnderwritingRun: false, hasCreditMemo: false })
    expect(readiness.outstanding.length).toBeGreaterThan(5)
    expect(readiness.outstanding.every((item) => item.href !== null)).toBe(true)
    // Required items are listed before recommended ones.
    const firstRecommended = readiness.outstanding.findIndex((item) => item.importance === 'recommended')
    const lastRequired = readiness.outstanding.map((item) => item.importance).lastIndexOf('required')
    if (firstRecommended !== -1) expect(lastRequired).toBeLessThan(firstRecommended)
  })
})

describe('reconciliation', () => {
  function source(overrides: Partial<ExtractedField> & { documentName: string }): ExtractedField & { documentName: string } {
    return {
      id: 'e-1', deal_id: 'deal-1', run_id: 'r-1', document_id: 'doc-1', field_name: 'revenue',
      value: '1', normalized_value: 1, unit: 'usd', year: 2025, period: '2025', page_number: null,
      source_text: null, confidence: 0.95, extraction_method: 'structured_parse',
      review_status: 'unreviewed', reviewed_by: null, reviewed_at: null, created_at: NOW,
      ...overrides,
    }
  }

  it('validates every finding against the schema', () => {
    const findings = reconcile({ snapshot: makeSnapshot({ documents: [] }), extracted: [] })
    expect(() => reconciliationResultSchema.parse({ findings })).not.toThrow()
  })

  it('raises a conflict when two documents disagree materially', () => {
    const findings = reconcile({
      snapshot: makeSnapshot(),
      extracted: [
        source({ id: 'a', document_id: 'doc-pl', normalized_value: 18_400_000, documentName: '2025 P&L' }),
        source({ id: 'b', document_id: 'doc-tax', normalized_value: 16_900_000, documentName: '2025 Tax Return' }),
      ],
    })
    const conflict = findings.find((f) => f.detector_key === 'conflict:revenue:2025')
    expect(conflict).toBeDefined()
    expect(conflict!.conflicting_values).toHaveLength(2)
    expect(conflict!.document_ids).toEqual(expect.arrayContaining(['doc-pl', 'doc-tax']))
    expect(conflict!.suggested_question).toBeTruthy()
  })

  it('ignores an immaterial difference', () => {
    const findings = reconcile({
      snapshot: makeSnapshot(),
      extracted: [
        source({ id: 'a', document_id: 'doc-pl', normalized_value: 18_400_000, documentName: 'P&L' }),
        source({ id: 'b', document_id: 'doc-tax', normalized_value: 18_390_000, documentName: 'Tax return' }),
      ],
    })
    expect(findings.find((f) => f.detector_key === 'conflict:revenue:2025')).toBeUndefined()
  })

  it('does not treat two figures from the same document as a conflict', () => {
    const findings = reconcile({
      snapshot: makeSnapshot(),
      extracted: [
        source({ id: 'a', document_id: 'doc-pl', normalized_value: 18_400_000, documentName: 'P&L' }),
        source({ id: 'b', document_id: 'doc-pl', normalized_value: 16_000_000, documentName: 'P&L' }),
      ],
    })
    expect(findings.find((f) => f.detector_key === 'conflict:revenue:2025')).toBeUndefined()
  })

  it('flags a census that exceeds licensed capacity as impossible', () => {
    const snapshot = makeSnapshot()
    snapshot.facility!.current_census = 130
    const findings = reconcile({ snapshot, extracted: [] })
    const finding = findings.find((f) => f.detector_key === 'census_exceeds_licensed_beds')
    expect(finding?.severity).toBe('critical')
  })

  it('flags a payer mix that does not total 100%', () => {
    const snapshot = makeSnapshot()
    snapshot.metrics!.medicaid_pct = 40
    const findings = reconcile({ snapshot, extracted: [] })
    expect(findings.some((f) => f.detector_key === 'payer_mix_does_not_sum')).toBe(true)
  })

  it('flags an appraisal below the contract price', () => {
    const snapshot = makeSnapshot()
    snapshot.terms!.appraised_value = 12_100_000
    const findings = reconcile({ snapshot, extracted: [] })
    const finding = findings.find((f) => f.detector_key === 'appraisal_below_price')
    expect(finding?.severity).toBe('high')
    expect(finding?.description).toContain('12,100,000')
  })

  it('flags a material EBITDA decline', () => {
    const snapshot = makeSnapshot()
    snapshot.latest!.items.ebitda = 1_500_000
    const findings = reconcile({ snapshot, extracted: [] })
    expect(findings.some((f) => f.detector_key === 'ebitda_decline')).toBe(true)
  })

  it('reports every missing required document', () => {
    const findings = reconcile({ snapshot: makeSnapshot({ documents: [] }), extracted: [] })
    const missing = findings.filter((f) => f.category === 'missing_document')
    expect(missing.length).toBeGreaterThanOrEqual(7)
    expect(missing.some((f) => f.detector_key === 'missing_document:profit_and_loss')).toBe(true)
  })

  it('produces stable detector keys so re-running does not duplicate findings', () => {
    const input = { snapshot: makeSnapshot({ documents: [] }), extracted: [] }
    const first = reconcile(input).map((f) => f.detector_key)
    const second = reconcile(input).map((f) => f.detector_key)
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
  })
})

describe('credit analysis', () => {
  it('validates against the analysis schema', () => {
    const snapshot = makeSnapshot()
    const analysis = analyzeDeal(snapshot, scoreDeal(snapshot))
    expect(() => creditAnalysisSchema.parse(analysis)).not.toThrow()
  })

  it('never states or implies a credit decision', () => {
    const snapshot = makeSnapshot()
    const analysis = analyzeDeal(snapshot, scoreDeal(snapshot))
    const text = JSON.stringify(analysis).toLowerCase()
    expect(text).not.toMatch(/\bapproved\b/)
    expect(text).not.toMatch(/will approve/)
    expect(text).not.toMatch(/guarantee/)
    expect(analysis.summary).toMatch(/not a credit decision/i)
  })

  it('identifies the specific risk in a thin-coverage deal', () => {
    const snapshot = makeSnapshot({
      summary: summarize({
        loanAmount: 13_500_000, purchasePrice: 14_000_000, appraisedValue: 14_200_000,
        ratePct: 9, termMonths: 60, amortizationMonths: 240,
        revenue: 18_400_000, ebitda: 1_400_000, beds: 120, census: 104,
        managementFeePct: 5, replacementReservePerBed: 400,
      }),
    })
    const analysis = analyzeDeal(snapshot, scoreDeal(snapshot))
    expect(analysis.risks.some((risk) => /coverage/i.test(risk.title))).toBe(true)
    expect(analysis.potential_mitigants.length).toBeGreaterThan(0)
  })

  it('reports missing inputs instead of estimating them', () => {
    const empty = makeSnapshot({
      facility: null, terms: null, sponsor: null, metrics: null, metricHistory: [],
      periods: [], latest: null, prior: null, documents: [], summary: summarize({}),
    })
    const analysis = analyzeDeal(empty, scoreDeal(empty))
    expect(analysis.missing_information.length).toBeGreaterThan(2)
    expect(analysis.confidence).toBeLessThan(0.6)
  })

  it('names the payer concentration constraint on a Medicaid-heavy deal', () => {
    const snapshot = makeSnapshot()
    snapshot.metrics!.medicaid_pct = 82
    snapshot.metrics!.private_pay_pct = 4
    const analysis = analyzeDeal(snapshot, scoreDeal(snapshot))
    expect(analysis.risks.some((risk) => /medicaid/i.test(risk.title))).toBe(true)
    expect(analysis.lender_considerations.some((item) => /medicaid/i.test(item))).toBe(true)
  })
})
