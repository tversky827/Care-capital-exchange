import type { CreditAnalysisPayload, CreditMemoPayload } from '@/lib/ai/schemas'
import { assetNoun } from '@/lib/deal/display'
import type { DealSnapshot, PeriodView } from '@/lib/deal/snapshot'
import type { DealScore } from '@/lib/underwriting/score'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import type { DocumentRecord, ExtractedField, LineItemKey, MemoCitation } from '@/types'

/**
 * Credit memo generation.
 *
 * The memo is assembled from the deal's own database records, never from a
 * separate narrative store — so a figure in the memo is by construction the
 * same figure the marketplace card and the match engine used.
 *
 * Every financial fact that has a supporting document carries a citation
 * marker, and each marker resolves to a document and page. That traceability
 * is what makes a memo credible to a lender who did not assemble the deal.
 */

export interface MemoInput {
  snapshot: DealSnapshot
  analysis: CreditAnalysisPayload
  score: DealScore
  extracted: ExtractedField[]
  documents: DocumentRecord[]
}

/**
 * Collects citations as sections are written and hands back stable markers.
 * A repeated fact reuses its marker rather than accumulating duplicates.
 */
class CitationBook {
  private readonly entries: MemoCitation[] = []
  private readonly index = new Map<string, string>()

  constructor(
    private readonly extracted: ExtractedField[],
    private readonly documents: DocumentRecord[],
  ) {}

  /** Cites a value against the document it was extracted from, if there is one. */
  cite(fieldName: string, year: number | null, label: string, value: string): string {
    const source = this.extracted.find(
      (f) =>
        f.field_name === fieldName &&
        (year === null || f.year === year) &&
        f.review_status !== 'rejected' &&
        f.document_id !== null,
    )
    const document = source ? this.documents.find((d) => d.id === source.document_id) : undefined
    const key = `${fieldName}|${year ?? ''}|${document?.id ?? 'deal-record'}`
    const existing = this.index.get(key)
    if (existing) return existing

    const marker = `[${this.entries.length + 1}]`
    this.index.set(key, marker)
    this.entries.push({
      marker,
      label: document
        ? `${label}: ${value} (${document.display_name}${source?.page_number ? `, page ${source.page_number}` : ''})`
        : `${label}: ${value} (entered on the deal record)`,
      document_id: document?.id ?? null,
      page: source?.page_number ?? null,
      value,
    })
    return marker
  }

  forSection(): MemoCitation[] {
    const taken = [...this.entries]
    this.entries.length = 0
    this.index.clear()
    return taken
  }
}

function periodLabel(period: PeriodView | null): string {
  return period?.period.label ?? 'the most recent period'
}

function line(period: PeriodView | null, key: LineItemKey): number | null {
  return period?.items[key] ?? null
}

export function generateMemo(input: MemoInput): CreditMemoPayload {
  const { snapshot, analysis, score, extracted, documents } = input
  const { deal, facility, terms, sponsor, metrics, latest, prior, summary } = snapshot
  const book = new CitationBook(extracted, documents)
  const sections: CreditMemoPayload['sections'] = []

  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const assetLabel = titleize(deal.asset_type)
  const assetNounLabel = assetNoun(deal.asset_type)
  const facilityName = facility?.name ?? deal.name
  const location = [facility?.city, facility?.state].filter(Boolean).join(', ')

  const add = (key: string, title: string, body: string) => {
    sections.push({ key, title, body: body.trim(), citations: book.forSection() })
  }

  // --- Executive summary --------------------------------------------------
  {
    const loanCite = summary.loanAmount
      ? book.cite('requested_financing', null, 'Requested financing', formatCurrency(summary.loanAmount))
      : ''
    const revenueCite = latest?.items.revenue
      ? book.cite('revenue', latest.period.fiscal_year, `${latest.period.label} revenue`, formatCurrency(latest.items.revenue))
      : ''
    const ebitdaCite = latest?.items.ebitda
      ? book.cite('ebitda', latest.period.fiscal_year, `${latest.period.label} EBITDA`, formatCurrency(latest.items.ebitda))
      : ''

    add('executive_summary', 'Executive Summary', `
${facilityName}${location ? `, ${location}` : ''} is a ${beds ? `${beds}-bed ` : ''}${assetNounLabel}. The sponsor is seeking ${formatCurrency(summary.loanAmount)}${loanCite} of ${titleize(deal.transaction_type).toLowerCase()} financing${terms?.purchase_price ? ` in connection with a ${formatCurrency(terms.purchase_price)} acquisition` : ''}.

For ${periodLabel(latest)}, the facility generated revenue of ${formatCurrency(latest?.items.revenue ?? null)}${revenueCite} and EBITDA of ${formatCurrency(latest?.items.ebitda ?? null)}${ebitdaCite}, an EBITDA margin of ${formatPercent(summary.ebitdaMargin)}. Underwritten net operating income, after an imputed management fee and replacement reserve, is ${formatCurrency(summary.noi)}.

At the requested loan amount the transaction underwrites to ${formatPercent(summary.ltv)} loan-to-value, ${formatRatio(summary.dscr)} debt service coverage and a ${formatPercent(summary.debtYield)} debt yield${snapshot.assumedTerms.assumed ? `, using an assumed ${formatPercent(snapshot.assumedTerms.ratePct)} rate over a ${snapshot.assumedTerms.amortizationMonths / 12}-year amortization` : ''}.

${analysis.summary}
    `)
  }

  // --- Transaction overview -----------------------------------------------
  {
    const priceCite = terms?.purchase_price
      ? book.cite('purchase_price', null, 'Purchase price', formatCurrency(terms.purchase_price))
      : ''
    const appraisalCite = terms?.appraised_value
      ? book.cite('appraised_value', null, 'Appraised value', formatCurrency(terms.appraised_value))
      : ''

    add('transaction_overview', 'Transaction Overview', `
Transaction type: ${titleize(deal.transaction_type)}
Asset type: ${assetLabel}
Purchase price: ${formatCurrency(terms?.purchase_price ?? null)}${priceCite}
Appraised value: ${formatCurrency(terms?.appraised_value ?? null)}${appraisalCite}
Requested financing: ${formatCurrency(terms?.requested_financing ?? null)}
Existing debt to be retired: ${formatCurrency(terms?.existing_debt ?? null)}
Seller financing: ${formatCurrency(terms?.seller_financing ?? null)}
Estimated closing costs: ${formatCurrency(terms?.estimated_closing_costs ?? null)}
Capital expenditure requirement: ${formatCurrency(terms?.capex_requirement ?? null)}
Working capital requirement: ${formatCurrency(terms?.working_capital_requirement ?? null)}
Target closing: ${terms?.target_close_date ? terms.target_close_date.slice(0, 10) : 'Not specified'}
Purchase agreement status: ${terms?.purchase_agreement_status ?? 'Not specified'}

${terms?.appraised_value && terms.purchase_price && terms.appraised_value < terms.purchase_price
  ? `The appraisal is ${formatCurrency(terms.purchase_price - terms.appraised_value)} below the contract price. Proceeds are therefore constrained by value rather than cost, and the difference must be funded with additional equity.`
  : 'Value support and contract price are consistent, so proceeds are not constrained by the appraisal.'}
    `)
  }

  // --- Borrower & facility ------------------------------------------------
  add('borrower', 'Borrower', `
Borrowing entity: ${sponsor?.legal_entity ?? 'To be confirmed'}
Operating company: ${facility?.operating_company ?? 'Not specified'}
Management company: ${facility?.management_company ?? 'Self-managed'}
Ownership structure: ${facility?.ownership_structure ?? 'Not specified'}
Real estate included in the transaction: ${facility?.real_estate_included ? 'Yes' : 'No'}
  `)

  {
    const bedCite = facility?.licensed_beds
      ? book.cite('licensed_beds', null, 'Licensed beds', String(facility.licensed_beds))
      : ''
    add('facility', 'Facility', `
${facilityName}
${[facility?.address_line1, facility?.city, facility?.state, facility?.zip].filter(Boolean).join(', ') || 'Address not provided'}
${facility?.county ? `County: ${facility.county}` : ''}

Licensed beds: ${facility?.licensed_beds ?? '—'}${bedCite}
Certified beds: ${facility?.certified_beds ?? '—'}
Operating beds: ${facility?.operating_beds ?? '—'}
Current census: ${facility?.current_census ?? '—'}
Occupancy: ${formatPercent(facility?.occupancy_pct ?? metrics?.occupancy_pct ?? null)}
Year built: ${facility?.year_built ?? '—'}
Last renovation: ${facility?.last_renovation_year ?? '—'}
${facility?.cms_star_rating ? `CMS overall star rating: ${facility.cms_star_rating} of 5` : ''}
    `)
  }

  // --- Historical financial performance -----------------------------------
  {
    const historical = snapshot.periods.filter((p) => p.period.period_type !== 'projection')
    const rows: LineItemKey[] = ['revenue', 'labor_expense', 'agency_labor', 'rent', 'ebitda', 'ebitdar', 'net_income']
    const header = ['Line item', ...historical.map((p) => p.period.label)].join(' | ')
    const divider = ['---', ...historical.map(() => '---')].join(' | ')
    const body = rows
      .filter((key) => historical.some((p) => line(p, key) !== null))
      .map((key) => [titleize(key), ...historical.map((p) => formatCurrency(line(p, key)))].join(' | '))
      .join('\n')

    for (const period of historical) {
      if (period.items.revenue != null) {
        book.cite('revenue', period.period.fiscal_year, `${period.period.label} revenue`, formatCurrency(period.items.revenue))
      }
      if (period.items.ebitda != null) {
        book.cite('ebitda', period.period.fiscal_year, `${period.period.label} EBITDA`, formatCurrency(period.items.ebitda))
      }
    }

    add('historical_financial_performance', 'Historical Financial Performance', `
${header}
${divider}
${body || 'No historical financial data has been recorded for this deal.'}

${summary.revenueGrowthPct !== null && prior && latest
  ? `Revenue ${summary.revenueGrowthPct >= 0 ? 'grew' : 'declined'} ${formatPercent(Math.abs(summary.revenueGrowthPct))} between ${prior.period.label} and ${latest.period.label}. EBITDA ${(summary.ebitdaGrowthPct ?? 0) >= 0 ? 'grew' : 'declined'} ${formatPercent(Math.abs(summary.ebitdaGrowthPct ?? 0))} over the same period, producing an EBITDA margin of ${formatPercent(summary.ebitdaMargin)}.`
  : 'A year-over-year comparison is not available from the periods currently on file.'}

Underwritten net operating income of ${formatCurrency(summary.noi)} reflects the following adjustments to reported EBITDA:
${summary.noiAdjustments.length
  ? summary.noiAdjustments.map((a) => `  • ${a.label}: ${formatCurrency(a.amount)}`).join('\n')
  : '  • No adjustments applied.'}
    `)
  }

  // --- Operating performance ----------------------------------------------
  add('operating_performance', 'Operating Performance', `
Occupancy: ${formatPercent(facility?.occupancy_pct ?? metrics?.occupancy_pct ?? null)}
Average census: ${metrics?.average_census ?? facility?.current_census ?? '—'}
Revenue per patient day: ${formatCurrency(metrics?.revenue_per_patient_day ?? summary.revenuePerPatientDay, { decimals: 2 })}
Average daily rate: ${formatCurrency(metrics?.average_daily_rate ?? null, { decimals: 2 })}
Labor hours per patient day: ${metrics?.labor_hours_per_patient_day ?? '—'}
Labor expense: ${formatCurrency(line(latest, 'labor_expense'))}
Agency labor: ${formatCurrency(line(latest, 'agency_labor'))}${
  line(latest, 'agency_labor') != null && line(latest, 'labor_expense')
    ? ` (${formatPercent((line(latest, 'agency_labor')! / line(latest, 'labor_expense')!) * 100)} of total labor)`
    : ''
}

${snapshot.metricHistory.length > 1
  ? `Occupancy across the periods on file: ${snapshot.metricHistory.map((m) => `${m.period_label} ${formatPercent(m.occupancy_pct)}`).join(', ')}.`
  : ''}
  `)

  // --- Payer mix ----------------------------------------------------------
  {
    const mixCite = metrics?.medicaid_pct != null
      ? book.cite('medicaid_pct', null, 'Medicaid mix', formatPercent(metrics.medicaid_pct))
      : ''
    add('payer_mix', 'Payer Mix', `
${metrics
  ? [
      `Medicare: ${formatPercent(metrics.medicare_pct)}`,
      `Medicaid: ${formatPercent(metrics.medicaid_pct)}${mixCite}`,
      `Managed care: ${formatPercent(metrics.managed_care_pct)}`,
      `Private pay: ${formatPercent(metrics.private_pay_pct)}`,
      `Other: ${formatPercent(metrics.other_payer_pct)}`,
    ].join('\n')
  : 'Payer mix detail has not yet been provided.'}

${metrics?.medicaid_pct != null
  ? metrics.medicaid_pct > 70
    ? `Medicaid concentration of ${formatPercent(metrics.medicaid_pct)} is high. Reimbursement is set by state rate-setting rather than by the operator, which concentrates revenue risk outside management's control and narrows the pool of lenders able to participate.`
    : `Medicaid concentration of ${formatPercent(metrics.medicaid_pct)} is within the range most healthcare lenders will consider without a specific exception.`
  : ''}
    `)
  }

  // --- Sources & uses -----------------------------------------------------
  add('sources_and_uses', 'Sources & Uses', `
USES
${summary.sourcesAndUses.uses.map((u) => `  ${u.label}: ${formatCurrency(u.amount)} (${formatPercent(u.pct)})`).join('\n') || '  Not yet specified.'}
  Total uses: ${formatCurrency(summary.sourcesAndUses.totalUses)}

SOURCES
${summary.sourcesAndUses.sources.map((s) => `  ${s.label}: ${formatCurrency(s.amount)} (${formatPercent(s.pct)})`).join('\n') || '  Not yet specified.'}
  Total sources: ${formatCurrency(summary.sourcesAndUses.totalSources)}

${summary.sourcesAndUses.balanced
  ? 'Sources and uses balance.'
  : `Sources and uses do not balance; there is a ${formatCurrency(Math.abs(summary.sourcesAndUses.gap))} ${summary.sourcesAndUses.gap < 0 ? 'shortfall' : 'surplus'} to be reconciled.`}

Sponsor equity required at closing: ${formatCurrency(summary.equityRequirement)}.
  `)

  // --- Capital structure & debt service -----------------------------------
  add('capital_structure', 'Capital Structure', `
Requested senior financing: ${formatCurrency(summary.loanAmount)}
Value basis (lesser of cost and appraised value): ${formatCurrency(summary.valueBasis)}
Loan-to-value: ${formatPercent(summary.ltv)}
Total project cost: ${formatCurrency(summary.totalCost)}
Loan-to-cost: ${formatPercent(summary.loanToCost)}
Seller financing: ${formatCurrency(terms?.seller_financing ?? null)}
Sponsor equity: ${formatCurrency(summary.equityRequirement)}
  `)

  add('debt_service_analysis', 'Debt Service Analysis', `
${snapshot.assumedTerms.assumed
  ? `The borrower has not specified pricing, so the analysis below uses a platform assumption of ${formatPercent(snapshot.assumedTerms.ratePct)} over a ${snapshot.assumedTerms.amortizationMonths / 12}-year amortization with a ${snapshot.assumedTerms.termMonths / 12}-year term. Coverage will move with actual quoted terms.`
  : `Terms as requested by the borrower: ${formatPercent(snapshot.assumedTerms.ratePct)}, ${snapshot.assumedTerms.termMonths / 12}-year term, ${snapshot.assumedTerms.amortizationMonths / 12}-year amortization.`}

Monthly payment (amortizing): ${formatCurrency(summary.monthlyPayment, { decimals: 2 })}
Annual debt service (amortizing constant): ${formatCurrency(summary.annualDebtService)}
Year-one cash debt service: ${formatCurrency(summary.yearOneDebtService)}
Underwritten net operating income: ${formatCurrency(summary.noi)}
Debt service coverage: ${formatRatio(summary.dscr)}
Debt service coverage, year one: ${formatRatio(summary.dscrYearOne)}
Debt yield: ${formatPercent(summary.debtYield)}
Balloon balance at maturity: ${formatCurrency(summary.balloonBalance)}

Coverage is stated on the amortizing constant rather than the year-one cash payment, which is how lenders size regardless of any interest-only period.
  `)

  // --- Collateral & sponsor ------------------------------------------------
  add('collateral', 'Collateral', `
The collateral is ${facility?.real_estate_included ? 'the real property and the operating business' : 'the operating business; real estate is not part of this transaction'}.

Facility: ${facilityName}${location ? `, ${location}` : ''}
${beds ? `Beds: ${beds}` : ''}
${summary.valueBasis && beds ? `Value per bed: ${formatCurrency(summary.valueBasis / beds)}` : ''}
${summary.loanAmount && beds ? `Loan per bed: ${formatCurrency(summary.loanAmount / beds)}` : ''}
Year built: ${facility?.year_built ?? '—'}${facility?.last_renovation_year ? `, last renovated ${facility.last_renovation_year}` : ''}
  `)

  add('sponsor', 'Sponsor', `
${sponsor
  ? [
      `Legal entity: ${sponsor.legal_entity}`,
      `Years in healthcare: ${sponsor.years_in_healthcare ?? '—'}`,
      `Years operating ${assetLabel}: ${sponsor.years_operating_asset_type ?? '—'}`,
      `Facilities operated: ${sponsor.facilities_operated ?? '—'}`,
      `Beds under management: ${sponsor.beds_operated ?? '—'}`,
      `States: ${sponsor.states_operated.join(', ') || '—'}`,
      `Historical acquisitions: ${sponsor.historical_acquisitions ?? '—'}`,
      `Previous exits: ${sponsor.previous_exits ?? '—'}`,
      `Prior defaults disclosed: ${sponsor.prior_defaults ? 'Yes' : 'No'}`,
      `Stated net worth: ${formatCurrency(sponsor.net_worth)}`,
      `Stated liquidity: ${formatCurrency(sponsor.liquidity)}`,
      '',
      sponsor.management_team ?? '',
      sponsor.relevant_experience ?? '',
    ].filter(Boolean).join('\n')
  : 'Sponsor information has not yet been provided.'}
  `)

  // --- Risks, mitigants, questions ----------------------------------------
  add('risks', 'Risks', analysis.risks.length
    ? analysis.risks.map((r, i) => `${i + 1}. ${r.title} (${r.severity})\n   ${r.detail}`).join('\n\n')
    : 'No material risks were identified from the information currently on file. This is more likely to reflect incomplete information than an absence of risk.')

  add('mitigants', 'Mitigants', analysis.potential_mitigants.length
    ? analysis.potential_mitigants.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : 'No specific mitigants have been identified.')

  add('key_questions', 'Key Questions', analysis.questions.length
    ? analysis.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
    : 'No outstanding questions have been identified.')

  // --- Conclusion ----------------------------------------------------------
  add('conclusion', 'Conclusion', `
Deal score: ${score.overall} of 100 (${score.coverage}% input coverage).

${score.components.map((c) => `  • ${c.label} — ${c.score}/100 (${Math.round(c.weight * 100)}% weight): ${c.rationale}`).join('\n')}

${analysis.strengths.length ? `Supporting factors:\n${analysis.strengths.map((s) => `  • ${s}`).join('\n')}` : ''}

${analysis.lender_considerations.length ? `Considerations for lender selection:\n${analysis.lender_considerations.map((c) => `  • ${c}`).join('\n')}` : ''}

${analysis.missing_information.length ? `Information still outstanding:\n${analysis.missing_information.map((m) => `  • ${m}`).join('\n')}` : 'All expected underwriting inputs have been provided.'}

This memorandum was prepared from documents and information supplied by the borrower and has not been independently verified. It is an analysis prepared to support a lender's own underwriting; it is not a credit approval, a commitment to lend, an offer of financing, or advice of any kind. Each lender must reach its own credit conclusion.
  `)

  return { sections }
}
