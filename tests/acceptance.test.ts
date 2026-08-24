import { attachLender, createActor, installTestStore } from './helpers/harness'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'

/**
 * End-to-end acceptance test.
 *
 * Walks the complete workflow the product exists to support — borrower signs
 * up, creates a deal, uploads documents, the pipeline extracts and reconciles
 * them, metrics compute, discrepancies surface and are resolved, underwriting
 * runs, the memo generates, the deal is distributed, a lender reviews it and
 * submits an indication, the borrower compares and selects, and the whole
 * thing is auditable.
 *
 * Nothing here is mocked. Every step calls the same service the interface
 * calls, against a real (in-memory) store and real files on disk.
 */

let store: Store
let borrower: Actor
let lenderA: Actor
let lenderB: Actor
let admin: Actor
let deal: Deal

const OPERATING_STATEMENTS = [
  'Cedar Point Skilled Nursing — Statement of Operations',
  'Line Item,2023,2024,2025',
  'Total Revenue,"$15,900,000","$16,800,000","$17,900,000"',
  'Total Salaries & Benefits,"$8,700,000","$9,100,000","$9,600,000"',
  'Agency Labor,"$980,000","$720,000","$430,000"',
  'Rent,"$0","$0","$0"',
  'Utilities,"$495,000","$520,000","$555,000"',
  'Insurance,"$445,000","$470,000","$501,000"',
  'Management Fee,"$795,000","$840,000","$895,000"',
  'Total Operating Expenses,"$13,900,000","$14,500,000","$15,300,000"',
  'EBITDA,"$2,000,000","$2,300,000","$2,600,000"',
  'Net Income,"$840,000","$966,000","$1,092,000"',
  'Occupancy,84.0%,86.0%,88.0%',
].join('\n')

// The tax return disagrees with the operating statements on 2025 revenue.
// Reconciliation must find this rather than silently choosing one.
const TAX_RETURN = [
  'Cedar Point Operations LLC',
  'U.S. Return of Partnership Income — Tax Year 2025',
  '',
  'FY2025',
  '',
  'Total Revenue ................. $16,450,000',
  'Net Income .................... $1,092,000',
].join('\n')

const CENSUS = [
  'Cedar Point Skilled Nursing — Monthly Census',
  'Licensed Beds,110',
  'Operating Beds,110',
  '',
  'Month,Average Census,Occupancy,Patient Days',
  'Jan 2025,96,87.3%,2880',
  'Feb 2025,97,88.2%,2716',
  'Mar 2025,98,89.1%,3038',
  '',
  'Average Census,97',
  'Occupancy,88.0%',
].join('\n')

const PAYER_MIX = [
  'Cedar Point Skilled Nursing — Revenue by Payer',
  '',
  'Payer,Mix,Revenue,Average Census',
  'Medicare,18%,"$3,222,000",17',
  'Medicaid,54%,"$9,666,000",52',
  'Managed Care,14%,"$2,506,000",14',
  'Private Pay,12%,"$2,148,000",12',
  'Other,2%,"$358,000",2',
].join('\n')

const BALANCE_SHEET = [
  'Cedar Point Skilled Nursing — Balance Sheet',
  '',
  'Line Item,2025',
  'Cash and Equivalents,"$735,000"',
  'Accounts Receivable, net,"$1,754,000"',
  'Total Assets,"$14,200,000"',
].join('\n')

const PURCHASE_AGREEMENT = [
  'ASSET PURCHASE AGREEMENT — SUMMARY OF PRINCIPAL TERMS',
  '',
  'Facility: Cedar Point Skilled Nursing, Peoria, IL',
  '',
  'Purchase Price ................ $16,500,000',
  'Seller Financing .............. $750,000',
].join('\n')

/**
 * Uploads through the real pipeline: the same service the interface calls,
 * with processing run inline so the whole job chain — extraction,
 * reconciliation, match recomputation — completes before the test continues.
 */
async function upload(filename: string, content: string, docType: string) {
  const { uploadDocument } = await import('@/services/documents')
  return uploadDocument({
    actor: borrower,
    dealId: deal.id,
    filename,
    mimeType: filename.endsWith('.csv') ? 'text/csv' : 'text/plain',
    data: Buffer.from(content, 'utf8'),
    docType: docType as never,
    processing: 'inline',
  })
}

beforeAll(async () => {
  store = installTestStore()

  // --- 1. A borrower signs up, which creates their organisation ------------
  borrower = await createActor(store, {
    email: 'operator@cedarpoint.test',
    name: 'Rosa Iyengar',
    companyName: 'Cedar Point Healthcare Group',
    companyType: 'borrower',
    role: 'borrower',
  })

  admin = await createActor(store, {
    email: 'admin@platform.test',
    name: 'Platform Operator',
    companyName: 'CareCapital Exchange',
    companyType: 'admin',
    role: 'admin',
  })

  // --- Two lending institutions, verified by the administrator -------------
  const { setVerification, upsertLendingBox } = await import('@/services/lenders')

  lenderA = await createActor(store, {
    email: 'origination@midwest.test',
    name: 'Nia Barlow',
    companyName: 'Midwest Healthcare Bank',
    companyType: 'lender',
    role: 'lender',
  })
  await store.insert('lenders', {
    company_id: lenderA.company.id,
    institution_name: 'Midwest Healthcare Bank',
    institution_type: 'bank',
    description: 'Regional healthcare lender.',
    logo_initials: 'MH',
    verification_status: 'pending',
    verified_at: null,
    verified_by: null,
    contact_name: 'Nia Barlow',
    contact_email: 'origination@midwest.test',
    contact_phone: null,
    public_profile_fields: ['description'],
    responsiveness_score: 80,
    is_demo: false,
  } as never)
  lenderA = await attachLender(store, lenderA)

  lenderB = await createActor(store, {
    email: 'deals@national.test',
    name: 'Yusuf Adeyemi',
    companyName: 'National Healthcare Credit',
    companyType: 'lender',
    role: 'lender',
  })
  await store.insert('lenders', {
    company_id: lenderB.company.id,
    institution_name: 'National Healthcare Credit',
    institution_type: 'debt_fund',
    description: 'Higher-leverage national debt fund.',
    logo_initials: 'NC',
    verification_status: 'pending',
    verified_at: null,
    verified_by: null,
    contact_name: 'Yusuf Adeyemi',
    contact_email: 'deals@national.test',
    contact_phone: null,
    public_profile_fields: ['description'],
    responsiveness_score: 90,
    is_demo: false,
  } as never)
  lenderB = await attachLender(store, lenderB)

  await setVerification(admin, lenderA.lender!.id, 'verified')
  await setVerification(admin, lenderB.lender!.id, 'verified')
  lenderA = await attachLender(store, lenderA)
  lenderB = await attachLender(store, lenderB)

  await upsertLendingBox(lenderA, {
    min_loan: 3_000_000, max_loan: 25_000_000, max_ltv_pct: 80, min_dscr: 1.35,
    min_debt_yield_pct: 11, min_occupancy_pct: 82, states: ['IL', 'IN', 'WI'],
    excluded_states: [], asset_types: ['snf', 'alf'], excluded_asset_types: [],
    transaction_types: ['acquisition', 'refinance'], min_operator_years: 5,
    min_facilities_operated: 2, max_medicaid_pct: 70, preferred_deal_size: 12_000_000,
    typical_rate_low_pct: 6.9, typical_rate_high_pct: 7.9, typical_term_months: 60,
    requires_appraisal: true, requires_environmental: false, required_tax_return_years: 2,
  })

  await upsertLendingBox(lenderB, {
    min_loan: 7_500_000, max_loan: 75_000_000, max_ltv_pct: 85, min_dscr: 1.2,
    min_debt_yield_pct: 9.5, min_occupancy_pct: 72, states: [], excluded_states: [],
    asset_types: ['snf', 'alf', 'memory_care'], excluded_asset_types: [],
    transaction_types: ['acquisition', 'refinance', 'bridge'], min_operator_years: 3,
    min_facilities_operated: 1, max_medicaid_pct: null, preferred_deal_size: 20_000_000,
    typical_rate_low_pct: 9.5, typical_rate_high_pct: 12, typical_term_months: 36,
    requires_appraisal: true, requires_environmental: true, required_tax_return_years: 2,
  })

  // --- 2-4. Borrower creates an SNF acquisition ----------------------------
  const { createDeal } = await import('@/services/deals')
  deal = await createDeal({
    actor: borrower,
    name: 'Cedar Point Skilled Nursing',
    assetType: 'snf',
    transactionType: 'acquisition',
    borrowerPriority: 'lowest_rate',
    narrative: 'Acquisition of a stabilised 110-bed facility from a retiring owner-operator.',
    facility: {
      name: 'Cedar Point Skilled Nursing',
      state: 'IL',
      city: 'Peoria',
      licensed_beds: 110,
      certified_beds: 110,
      operating_beds: 110,
      current_census: 97,
      occupancy_pct: 88,
      year_built: 1996,
      last_renovation_year: 2020,
      real_estate_included: true,
      operating_company: 'Cedar Point Operations LLC',
    },
    terms: {
      purchase_price: 16_500_000,
      requested_financing: 12_000_000,
      appraised_value: 16_700_000,
      seller_financing: 750_000,
      estimated_closing_costs: 495_000,
      requested_rate_pct: 7.1,
      requested_term_months: 60,
      requested_amortization_months: 300,
      requested_io_months: 12,
      target_close_date: new Date(Date.now() + 80 * 86_400_000).toISOString(),
    },
    sponsor: {
      legal_entity: 'Cedar Point Healthcare Group LLC',
      years_in_healthcare: 12,
      years_operating_asset_type: 9,
      facilities_operated: 5,
      beds_operated: 540,
      states_operated: ['IL', 'IN'],
      historical_acquisitions: 6,
      previous_exits: 1,
      prior_defaults: false,
      net_worth: 21_000_000,
      liquidity: 6_500_000,
    },
  })

  // --- 5-7. Documents uploaded and processed by the real pipeline ---------
  await upload('operating-statements.csv', OPERATING_STATEMENTS, 'profit_and_loss')
  await upload('balance-sheet.csv', BALANCE_SHEET, 'balance_sheet')
  await upload('census.csv', CENSUS, 'census')
  await upload('payer-mix.csv', PAYER_MIX, 'payer_mix')
  await upload('tax-return-2025.txt', TAX_RETURN, 'tax_return')
  await upload('purchase-agreement.txt', PURCHASE_AGREEMENT, 'purchase_agreement')
}, 60_000)

describe('acceptance: borrower to lender workflow', () => {
  it('1-3. creates a borrower organisation and an SNF acquisition', async () => {
    expect(deal.reference).toMatch(/^CCX-\d+$/)
    expect(deal.company_id).toBe(borrower.company.id)
    expect(deal.asset_type).toBe('snf')
    expect(deal.transaction_type).toBe('acquisition')
    expect(deal.status).toBe('intake')
  })

  it('4. records the purchase price and financing request', async () => {
    const terms = await store.selectOne('transaction_terms', { where: { deal_id: deal.id } })
    expect(terms?.purchase_price).toBe(16_500_000)
    expect(terms?.requested_financing).toBe(12_000_000)
  })

  it('5-6. puts every uploaded document in the data room', async () => {
    const { documentsForDeal } = await import('@/services/documents')
    const documents = await documentsForDeal(deal.id)
    expect(documents).toHaveLength(6)
    expect(documents.every((document) => document.malware_scan === 'clean')).toBe(true)
    expect(documents.map((document) => document.doc_type)).toContain('profit_and_loss')
  })

  it('7. processes them through the extraction pipeline', async () => {
    const runs = await store.select('extraction_runs', { where: { deal_id: deal.id } })
    expect(runs).toHaveLength(6)
    expect(runs.every((run) => run.status === 'complete')).toBe(true)

    const documents = await store.select('documents', { where: { deal_id: deal.id } })
    expect(documents.every((document) => document.processing_status === 'processed')).toBe(true)
  })

  it('8. surfaces the extracted financial data with traceable sources', async () => {
    const fields = await store.select('extracted_fields', { where: { deal_id: deal.id } })
    expect(fields.length).toBeGreaterThan(20)

    const revenue2025 = fields.find(
      (field) => field.field_name === 'revenue' && field.year === 2025 && field.confidence >= 0.9,
    )
    expect(revenue2025?.normalized_value).toBe(17_900_000)
    expect(revenue2025?.document_id).toBeTruthy()
    expect(revenue2025?.source_text).toContain('17,900,000')

    // The pipeline projected the extracted figures onto the deal's periods.
    const { buildSnapshot } = await import('@/lib/deal/snapshot')
    const snapshot = await buildSnapshot(deal.id)
    expect(snapshot?.periods.length).toBeGreaterThanOrEqual(3)
    expect(snapshot?.latest?.items.revenue).toBe(17_900_000)
    expect(snapshot?.latest?.items.ebitda).toBe(2_600_000)
  })

  it('9-11. computes LTV, DSCR and debt yield deterministically', async () => {
    const { buildSnapshot } = await import('@/lib/deal/snapshot')
    const snapshot = await buildSnapshot(deal.id)
    const summary = snapshot!.summary

    // Sized against the lesser of appraised value and price: 12.0M / 16.5M.
    expect(summary.ltv).toBeCloseTo(72.73, 1)
    expect(summary.dscr).not.toBeNull()
    expect(summary.dscr!).toBeGreaterThan(1)
    expect(summary.debtYield).not.toBeNull()
    expect(summary.noi).not.toBeNull()

    // Coverage must reconcile with the NOI and debt service actually shown.
    expect(summary.dscr).toBeCloseTo(summary.noi! / summary.annualDebtService!, 2)
    expect(summary.debtYield).toBeCloseTo((summary.noi! / 12_000_000) * 100, 2)
  })

  it('12. raises the conflict between the tax return and the operating statements', async () => {
    const { listDiscrepancies } = await import('@/services/discrepancies')
    const issues = await listDiscrepancies(deal.id)
    expect(issues.length).toBeGreaterThan(0)

    const revenueConflict = issues.find((issue) => issue.detector_key === 'conflict:revenue:2025')
    expect(revenueConflict).toBeDefined()
    expect(revenueConflict!.status).toBe('open')
    expect(revenueConflict!.severity === 'high' || revenueConflict!.severity === 'critical').toBe(true)
    // Both values are presented with their sources; neither is chosen.
    expect(revenueConflict!.conflicting_values).toHaveLength(2)
    expect(revenueConflict!.suggested_question).toBeTruthy()
    expect(revenueConflict!.document_ids.length).toBeGreaterThanOrEqual(2)
  })

  it('13. lets the borrower resolve a discrepancy, with the resolution recorded', async () => {
    const { listDiscrepancies, resolveDiscrepancy } = await import('@/services/discrepancies')
    const open = (await listDiscrepancies(deal.id)).filter((issue) => issue.status === 'open')

    for (const issue of open) {
      if (issue.severity !== 'critical' && issue.severity !== 'high') continue
      await resolveDiscrepancy({
        actor: borrower,
        discrepancyId: issue.id,
        action: 'resolve',
        note: 'The tax return is prepared on a cash basis; the operating statements are accrual and are the figure of record.',
      })
    }

    const after = await listDiscrepancies(deal.id)
    expect(after.filter((issue) => issue.status === 'open' && (issue.severity === 'critical' || issue.severity === 'high'))).toHaveLength(0)

    const resolutions = await store.select('discrepancy_resolutions', { where: { deal_id: deal.id } })
    expect(resolutions.some((entry) => entry.resolved_by === borrower.user.id)).toBe(true)
    // Automatic closures are recorded with no user, not with a fabricated one.
    expect(resolutions.every((entry) => entry.resolved_by === null || entry.resolved_by === borrower.user.id)).toBe(true)
  })

  it('approves the extracted values, which is what makes them the deal figures', async () => {
    const { approveLineItem } = await import('@/services/deals')
    const pending = await store.select('financial_line_items', {
      where: { deal_id: deal.id, approved_value: null },
    })
    expect(pending.length).toBeGreaterThan(0)

    for (const item of pending) {
      if (item.proposed_value === null) continue
      const approved = await approveLineItem(borrower, item.id, item.proposed_value)
      expect(approved.approved_by).toBe(borrower.user.id)
      expect(approved.approved_value).toBe(item.proposed_value)
    }

    const stillPending = await store.select('financial_line_items', {
      where: { deal_id: deal.id, approved_value: null },
    })
    expect(stillPending.filter((item) => item.proposed_value !== null)).toHaveLength(0)
  })

  it('14-15. runs underwriting and produces a transparent deal score', async () => {
    const { runUnderwriting } = await import('@/services/underwriting')
    const result = await runUnderwriting(deal.id, { actor: borrower, force: true })

    expect(result.run.status).toBe('complete')
    expect(result.score.overall).toBeGreaterThan(0)
    expect(result.score.overall).toBeLessThanOrEqual(100)
    // Every component is published with its weight, and they sum to one.
    expect(result.score.components).toHaveLength(6)
    expect(result.score.components.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 6)
    expect(result.analysis.summary.length).toBeGreaterThan(50)
    expect(result.analysis.risks.length + result.analysis.strengths.length).toBeGreaterThan(0)

    // The analysis never carries a credit decision.
    const text = JSON.stringify(result.analysis).toLowerCase()
    expect(text).not.toMatch(/\bloan (is |has been )?approved\b/)

    const metrics = await store.select('underwriting_metrics', { where: { run_id: result.run.id } })
    expect(metrics.length).toBeGreaterThan(8)
    // Every metric carries the formula that produced it.
    expect(metrics.every((metric) => metric.formula.length > 0)).toBe(true)
  })

  it('16. generates a credit memo whose figures trace to source documents', async () => {
    const { generateCreditMemo } = await import('@/services/memo')
    const { memo, version } = await generateCreditMemo(deal.id, borrower)

    expect(memo.current_version).toBe(1)
    expect(version.sections.length).toBeGreaterThan(10)

    const keys = version.sections.map((section) => section.key)
    for (const required of [
      'executive_summary', 'transaction_overview', 'historical_financial_performance',
      'sources_and_uses', 'debt_service_analysis', 'risks', 'conclusion',
    ]) {
      expect(keys).toContain(required)
    }

    const citations = version.sections.flatMap((section) => section.citations)
    expect(citations.length).toBeGreaterThan(0)
    expect(citations.some((citation) => citation.document_id !== null)).toBe(true)

    const conclusion = version.sections.find((section) => section.key === 'conclusion')!
    expect(conclusion.body).toMatch(/not a credit approval|not.*commitment/i)
  })

  it('17. reports deal readiness and clears the distribution gate', async () => {
    const { readinessFor } = await import('@/services/underwriting')
    const readiness = await readinessFor(deal.id)

    expect(readiness).not.toBeNull()
    expect(readiness!.dimensions).toHaveLength(4)
    expect(readiness!.overall).toBeGreaterThanOrEqual(70)
    expect(readiness!.canDistribute).toBe(true)
    expect(readiness!.requiredOutstanding).toHaveLength(0)
  })

  it('matches the deal against verified lenders, with per-factor reasoning', async () => {
    const { computeMatches, matchesForDeal } = await import('@/services/matching')
    const result = await computeMatches(deal.id)
    expect(result.matches.length).toBe(2)
    expect(result.inBox).toBeGreaterThanOrEqual(1)

    const matches = await matchesForDeal(deal.id)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    for (const { match } of matches) {
      expect(match.factors).toHaveLength(10)
      expect(match.score).toBeGreaterThan(0)
      // The explanation never promises an approval.
      expect(match.ai_explanation?.toLowerCase()).not.toMatch(/will approve/)
    }
  })

  it('18. distributes the deal only after showing exactly who receives it', async () => {
    const { distributeDeal, previewDistribution } = await import('@/services/distribution')

    const preview = await previewDistribution(deal.id)
    expect(preview.canDistribute).toBe(true)
    expect(preview.lenders.length).toBeGreaterThanOrEqual(1)

    const result = await distributeDeal({
      actor: borrower,
      dealId: deal.id,
      scope: 'selected_lenders',
      lenderIds: preview.lenders.map((row) => row.lender.id),
    })
    expect(result.distributions.length).toBe(preview.lenders.length)
    expect(result.skipped).toHaveLength(0)

    const updated = await store.findById('deals', deal.id)
    expect(updated?.status).toBe('distributed')
    expect(updated?.distributed_at).toBeTruthy()
  })

  it('19-22. shows a distributed lender the deal with its own match score', async () => {
    const { loadDealForActor } = await import('@/lib/access')
    const access = await loadDealForActor(lenderA, deal.id)
    expect(access.deal.id).toBe(deal.id)
    expect(access.viaMarketplaceOnly).toBe(false)

    const match = await store.selectOne('matches', {
      where: { deal_id: deal.id, lender_id: lenderA.lender!.id },
    })
    expect(match).not.toBeNull()
    expect(match!.factors.some((factor) => factor.status === 'pass')).toBe(true)
  })

  it('23-26. gives the lender the financials, the memo and the authorized documents', async () => {
    const { currentMemo } = await import('@/services/memo')
    const { documentsVisibleToLender, authorizeDownload } = await import('@/services/documents')

    const memo = await currentMemo(deal.id)
    expect(memo?.version.sections.length).toBeGreaterThan(10)

    const visible = await documentsVisibleToLender(deal.id, lenderA)
    expect(visible.length).toBeGreaterThan(0)

    // Opening a document authorizes and logs before returning any bytes.
    const grant = await authorizeDownload(lenderA, visible[0]!.id, 'download', { ip: '198.51.100.7' })
    expect(grant.bytes.length).toBeGreaterThan(0)

    const accessLogs = await store.select('document_access_logs', {
      where: { document_id: visible[0]!.id },
    })
    expect(accessLogs.some((log) => log.user_id === lenderA.user.id && log.action === 'download')).toBe(true)
  })

  it('27. accepts a financing indication from each lender', async () => {
    const { submitIndication } = await import('@/services/indications')

    await submitIndication(lenderA, deal.id, {
      loan_amount: 11_500_000,
      rate_type: 'fixed',
      all_in_rate_pct: 7.15,
      term_months: 60,
      amortization_months: 300,
      interest_only_months: 12,
      origination_fee_pct: 1,
      exit_fee_pct: 0,
      recourse: 'partial_recourse',
      closing_timeline_days: 60,
      covenants: 'Minimum 1.25x DSCR tested quarterly',
      conditions: [{ label: 'Satisfactory third-party appraisal' }],
    })

    await submitIndication(lenderB, deal.id, {
      loan_amount: 12_000_000,
      rate_type: 'floating',
      index_name: 'SOFR (30-day average)',
      index_rate_pct: 4.15,
      spread_pct: 5.6,
      all_in_rate_pct: 9.75,
      term_months: 36,
      amortization_months: 360,
      interest_only_months: 24,
      origination_fee_pct: 1.5,
      exit_fee_pct: 0.5,
      recourse: 'non_recourse',
      closing_timeline_days: 40,
      conditions: [{ label: 'Phase I environmental site assessment', kind: 'diligence_item' }],
    })

    const indications = await store.select('indications', { where: { deal_id: deal.id } })
    expect(indications).toHaveLength(2)
    expect(indications.every((indication) => indication.is_commitment === false)).toBe(true)
  })

  it('28. notifies the borrower that indications arrived', async () => {
    const notifications = await store.select('notifications', {
      where: { user_id: borrower.user.id, event: 'indication.received' },
    })
    expect(notifications.length).toBeGreaterThanOrEqual(2)
    // The notification states plainly what an indication is.
    expect(notifications[0]!.body).toMatch(/not a commitment/i)
  })

  it('29-31. compares the indications on fee-loaded effective cost', async () => {
    const { compareIndications } = await import('@/services/indications')
    const comparison = await compareIndications(deal.id)

    expect(comparison).toHaveLength(2)
    for (const row of comparison) {
      expect(row.cost.monthlyPaymentAmortizing).not.toBeNull()
      expect(row.cost.effectiveRatePct).not.toBeNull()
      expect(row.dscrUnderTerms).not.toBeNull()
      // Fees push effective cost above the stated coupon.
      expect(row.cost.effectiveRatePct!).toBeGreaterThan(row.indication.all_in_rate_pct)
    }

    // The borrower's priority is lowest cost, so the cheaper loan ranks first.
    expect(comparison[0]!.rank).toBe(1)
    expect(comparison[0]!.indication.all_in_rate_pct).toBeLessThan(comparison[1]!.indication.all_in_rate_pct)
  })

  it('32-33. selects a preferred indication and moves the deal to diligence', async () => {
    const { compareIndications, selectIndication } = await import('@/services/indications')
    const comparison = await compareIndications(deal.id)
    const preferred = comparison[0]!

    await selectIndication(borrower, preferred.indication.id, 'Proceeding on this basis.')

    const indications = await store.select('indications', { where: { deal_id: deal.id } })
    expect(indications.find((entry) => entry.id === preferred.indication.id)?.status).toBe('selected')
    expect(indications.filter((entry) => entry.status === 'declined')).toHaveLength(1)

    const updated = await store.findById('deals', deal.id)
    expect(updated?.status).toBe('diligence')

    // The lender's own pipeline reflects the selection.
    const distribution = await store.selectOne('deal_distributions', {
      where: { deal_id: deal.id, lender_id: preferred.lender.id },
    })
    expect(distribution?.pipeline_stage).toBe('diligence')
  })

  it('34. records every material step in the audit log', async () => {
    const { auditForDeal } = await import('@/services/audit')
    const logs = await auditForDeal(deal.id, 500)
    const actions = new Set(logs.map((log) => log.action))

    for (const expected of [
      'deal.created',
      'document.uploaded',
      'document.extracted',
      'discrepancy.resolve',
      'financials.approved',
      'underwriting.completed',
      'memo.generated',
      'matches.computed',
      'deal.distributed',
      'document.download',
      'indication.submitted',
      'indication.selected',
      'deal.status_changed',
    ]) {
      expect(actions, `audit log is missing ${expected}`).toContain(expected)
    }

    // The distribution entry names exactly who received the package.
    const distribution = logs.find((log) => log.action === 'deal.distributed')!
    expect((distribution.metadata as { lenders?: unknown[] }).lenders?.length).toBeGreaterThan(0)
  })
})

describe('acceptance: confidentiality across the marketplace', () => {
  it('never lets one lender see another lender’s indication', async () => {
    const { indicationsForDeal } = await import('@/services/indications')
    const seenByA = await indicationsForDeal(deal.id, lenderA)
    const seenByB = await indicationsForDeal(deal.id, lenderB)
    const seenByBorrower = await indicationsForDeal(deal.id, borrower)

    expect(seenByA).toHaveLength(1)
    expect(seenByB).toHaveLength(1)
    expect(seenByA[0]!.lender_id).toBe(lenderA.lender!.id)
    expect(seenByB[0]!.lender_id).toBe(lenderB.lender!.id)
    expect(seenByBorrower).toHaveLength(2)
  })

  it('never lets a borrower or a rival lender read internal lender notes', async () => {
    const { addLenderNote, lenderNotes } = await import('@/services/lenders')
    await addLenderNote(lenderA, deal.id, 'Internal target is 70% LTV, not the 73% requested.')

    expect(await lenderNotes(lenderA, deal.id)).toHaveLength(1)
    expect(await lenderNotes(lenderB, deal.id)).toHaveLength(0)
    expect(await lenderNotes(borrower, deal.id)).toHaveLength(0)
  })

  it('shows a marketplace browser the anonymised label, not the facility', async () => {
    const { displayName, displayLocation, anonymizedLabel } = await import('@/lib/deal/display')
    const { canViewDealIdentity } = await import('@/lib/policy')
    const { subjectOf } = await import('@/lib/access')

    const store2 = store
    const facility = await store2.selectOne('facilities', { where: { deal_id: deal.id } })
    const current = (await store2.findById('deals', deal.id))!

    // A lender with no distribution — discovery only.
    const browser = await createActor(store2, {
      email: 'browsing@thirdlender.test',
      name: 'Browsing Lender',
      companyName: 'Third Lender Capital',
      companyType: 'lender',
      role: 'lender',
    })
    await store2.insert('lenders', {
      company_id: browser.company.id, institution_name: 'Third Lender Capital',
      institution_type: 'bank', description: null, logo_initials: 'TL',
      verification_status: 'verified', verified_at: new Date().toISOString(), verified_by: null,
      contact_name: null, contact_email: null, contact_phone: null,
      public_profile_fields: [], responsiveness_score: 50, is_demo: false,
    } as never)
    const browsing = await attachLender(store2, browser)

    const canSee = canViewDealIdentity(subjectOf(browsing), current, { distribution: null })
    expect(canSee).toBe(false)

    const shown = displayName(current, facility, canSee)
    expect(shown).toBe(anonymizedLabel(current, facility))
    expect(shown).not.toContain('Cedar Point')
    expect(shown).toMatch(/\d+-bed Skilled Nursing Facility/)
    // Location narrows to the state only.
    expect(displayLocation(facility, canSee)).toBe('Illinois')

    // A lender the deal was distributed to does see the identity.
    const distribution = await store2.selectOne('deal_distributions', {
      where: { deal_id: deal.id, lender_id: lenderA.lender!.id },
    })
    expect(canViewDealIdentity(subjectOf(lenderA), current, { distribution })).toBe(true)
  })

  it('denies an unrelated borrower access to the deal', async () => {
    const other = await createActor(store, {
      email: 'other@rival.test',
      name: 'Other Operator',
      companyName: 'Rival Operating Group',
      companyType: 'borrower',
      role: 'borrower',
    })
    const { loadDealForActor } = await import('@/lib/access')
    await expect(loadDealForActor(other, deal.id)).rejects.toThrow(/not found or not accessible/i)
  })

  it('denies document access to a lender whose distribution was revoked', async () => {
    const { revokeDistribution } = await import('@/services/distribution')
    const { authorizeDownload, documentsVisibleToLender } = await import('@/services/documents')

    const before = await documentsVisibleToLender(deal.id, lenderB)
    expect(before.length).toBeGreaterThan(0)

    const distribution = await store.selectOne('deal_distributions', {
      where: { deal_id: deal.id, lender_id: lenderB.lender!.id },
    })
    await revokeDistribution(borrower, distribution!.id, 'Financing awarded elsewhere.')

    const after = await documentsVisibleToLender(deal.id, lenderB)
    expect(after).toHaveLength(0)

    await expect(authorizeDownload(lenderB, before[0]!.id, 'download')).rejects.toThrow(/do not have access/i)

    // The denied attempt is logged, which is the event an administrator needs.
    const logs = await store.select('document_access_logs', { where: { document_id: before[0]!.id } })
    expect(logs.some((log) => log.company_id === lenderB.company.id && log.action === 'denied')).toBe(true)
  })
})
