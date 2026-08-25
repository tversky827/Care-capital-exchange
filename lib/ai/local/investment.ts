import { assetNoun, stateName } from '@/lib/deal/display'
import type { DealSnapshot } from '@/lib/deal/snapshot'
import type { BearCasePayload, InvestmentAnalysisPayload } from '@/lib/ai/schemas'
import type { Projection } from '@/lib/equity/projections'
import type { RiskResult } from '@/lib/equity/risk'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import type { Offering, OfferingTerms, ScenarioResults } from '@/types/equity'

/**
 * The deterministic investment analyst.
 *
 * Produces the same shape a language model would, from the deal's own figures.
 * It runs when no model is configured, and it is what the model's output is
 * validated against, so the product behaves identically either way.
 *
 * It never states a figure the engines did not compute, and never advises
 * anyone to invest in anything.
 */

export interface InvestmentAnalysisInput {
  snapshot: DealSnapshot
  offering: Offering
  terms: OfferingTerms | null
  projection: Projection
  risk: RiskResult
  openDiscrepancies: number
}

export function analyzeInvestment(input: InvestmentAnalysisInput): InvestmentAnalysisPayload {
  const { snapshot, offering, terms, projection, risk } = input
  const { deal, facility, summary } = snapshot
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null

  const descriptor = [
    beds ? `${beds}-bed` : null,
    assetNoun(deal.asset_type),
    facility?.state ? `in ${stateName(facility.state)}` : null,
  ].filter(Boolean).join(' ')

  const thesis = [
    `${offering.name} offers ${terms?.capital_position === 'preferred_equity' ? 'preferred' : 'common'} equity in a ${descriptor}.`,
    offering.target_raise ? `The sponsor is raising ${formatCurrency(offering.target_raise)}${offering.minimum_investment ? ` with a ${formatCurrency(offering.minimum_investment)} minimum` : ''}.` : 'The raise has not been sized.',
    summary.noi !== null ? `Underwritten net operating income is ${formatCurrency(summary.noi)}, against debt service that produces ${formatRatio(summary.dscr)} coverage.` : 'Underwritten income is not yet available for this deal.',
    projection.insufficientData === null && projection.irrPct !== null
      ? `On the assumptions the sponsor has stated, the model projects a ${formatPercent(projection.irrPct)} internal rate of return and a ${formatRatio(projection.equityMultiple)} equity multiple over ${projection.years.length} years.`
      : 'Returns cannot be projected until the sponsor states the assumptions behind them.',
    'These are projections derived from stated assumptions, not forecasts and not promises. This is analysis for an investor to weigh, not a recommendation to invest.',
  ].join(' ')

  const strengths: string[] = []
  if (summary.dscr !== null && summary.dscr >= 1.35) {
    strengths.push(`Debt service coverage of ${formatRatio(summary.dscr)} leaves room before the loan is under strain.`)
  }
  if (summary.ebitdaMargin !== null && summary.ebitdaMargin >= 0.09) {
    strengths.push(`An EBITDA margin of ${formatPercent(summary.ebitdaMargin * 100)} is at the healthier end of the skilled nursing range.`)
  }
  const occupancy = snapshot.metrics?.occupancy_pct ?? null
  if (occupancy !== null && occupancy >= 88) {
    strengths.push(`Occupancy of ${formatPercent(occupancy)} suggests demand is not the constraint on this facility.`)
  }
  if (snapshot.sponsor?.years_in_healthcare && snapshot.sponsor.years_in_healthcare >= 10) {
    strengths.push(`The sponsor has ${snapshot.sponsor.years_in_healthcare} years operating healthcare facilities, across ${snapshot.sponsor.facilities_operated ?? 'an unstated number of'} facilities.`)
  }
  if (summary.ltv !== null && summary.ltv <= 0.7) {
    strengths.push(`Leverage of ${formatPercent(summary.ltv * 100)} loan-to-value leaves equity with a cushion against a softer exit.`)
  }
  if (strengths.length === 0) {
    strengths.push('The deal record does not yet contain enough operating history to identify supporting factors.')
  }

  const risks = risk.categories
    .filter((category) => category.band !== 'low')
    .map((category) => ({
      title: `${titleFor(category.category)} risk is ${category.band}`,
      severity: (category.band === 'high' ? 'high' : 'medium') as 'high' | 'medium',
      detail: category.rationale,
      category: category.category,
    }))

  if (input.openDiscrepancies > 0) {
    risks.unshift({
      title: 'The source documents contradict each other',
      severity: 'high',
      detail: `${input.openDiscrepancies} unresolved discrepancy${input.openDiscrepancies === 1 ? '' : 'ies'} remain between documents on this deal. Figures presented here rest on data that has not been reconciled.`,
      category: 'financial',
    })
  }

  const keyAssumptions = projection.assumptionsUsed.map((a) => `${a.label}: ${a.value}`)

  const questions = [
    'What happens to distributions if occupancy falls five points below the assumption?',
    'How much of the projected return depends on the exit assumption rather than operations?',
    'What is the sponsor contributing in cash, and on what terms relative to outside investors?',
    'What are the fees over the life of the investment, and what are they charged on?',
    'What happens if the debt cannot be refinanced at the end of its term?',
    'What is the plan if a state Medicaid rate is reduced during the hold?',
  ]
  if (terms?.preferred_return_pct) {
    questions.push('Is the preferred return cumulative, and does it compound if unpaid?')
  }

  const missing: string[] = []
  if (projection.insufficientData) missing.push(projection.insufficientData)
  if (summary.noi === null) missing.push('Underwritten net operating income has not been established.')
  if (!terms?.target_hold_months) missing.push('No target hold period has been stated.')
  if (risk.coverage < 0.75) {
    missing.push(`Only ${Math.round(risk.coverage * 100)}% of the inputs the risk assessment expects were available.`)
  }

  const downside = [
    'Equity ranks behind every lender. A sale that does not clear the debt returns nothing to investors.',
    'There is no secondary market for this position. Capital should be assumed committed for the full term.',
    projection.years.length > 0
      ? `Debt service of ${formatCurrency(projection.years[0]?.debtService ?? null)} must be paid before any distribution reaches equity.`
      : 'Debt service is paid before any distribution reaches equity.',
  ]

  return {
    thesis,
    strengths: strengths.slice(0, 20),
    risks: risks.slice(0, 30),
    key_assumptions: keyAssumptions.slice(0, 20),
    questions_to_ask: questions.slice(0, 20),
    missing_information: missing.slice(0, 20),
    downside_considerations: downside.slice(0, 20),
    confidence: risk.coverage,
  }
}

function titleFor(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/**
 * The bear case, in words.
 *
 * The numbers beside it come from `projectScenario`; this supplies only the
 * explanation of what those numbers mean and what would have to go wrong.
 */
export function bearCase(
  input: InvestmentAnalysisInput,
  scenario: ScenarioResults,
): BearCasePayload {
  const { snapshot } = input
  const medicaid = snapshot.metrics?.medicaid_pct ?? null

  const narrative = scenario.insufficient_data
    ? `A downside case cannot be modelled for this offering: ${scenario.insufficient_data}`
    : [
      'In this scenario occupancy falls, revenue follows it down, agency labour rises to cover the gap, and the asset sells at a lower multiple than assumed.',
      scenario.dscr !== null
        ? `Debt service coverage falls to ${formatRatio(scenario.dscr)}${scenario.dscr < 1.2 ? ', which is below where most lenders set their covenant' : ''}.`
        : 'Debt service coverage cannot be computed from the information available.',
      scenario.cash_flow_to_equity !== null && scenario.cash_flow_to_equity <= 0
        ? 'There is no cash left for equity after debt service, so distributions stop.'
        : scenario.cash_flow_to_equity !== null
          ? `Cash to equity falls to ${formatCurrency(scenario.cash_flow_to_equity)} in the first year.`
          : '',
      scenario.irr_pct !== null
        ? `The projected return falls to ${formatPercent(scenario.irr_pct)}, against an equity multiple of ${formatRatio(scenario.equity_multiple)}.`
        : 'A return cannot be projected under these conditions.',
      'This is one arithmetic scenario among many, not a prediction. Actual outcomes can be worse than any modelled case.',
    ].filter(Boolean).join(' ')

  const drivers = [
    { label: 'Occupancy decline', detail: 'Census is the single largest driver of revenue in skilled nursing. A five-point fall moves the top line immediately and the operating leverage magnifies it.' },
    { label: 'Agency labour', detail: 'Covering unfilled shifts with agency staff costs materially more per hour. Sustained reliance on it erodes margin faster than revenue recovers.' },
    { label: 'Interest rate', detail: 'Floating-rate or maturing debt reprices independently of how the facility performs. A higher rate takes cash before equity sees any.' },
    { label: 'Exit multiple', detail: 'Most of a projected equity return is usually the sale. A lower multiple at exit reduces the return more than an operating shortfall does.' },
    { label: 'Capital expenditure', detail: 'An unplanned roof, boiler or life-safety remediation is paid from cash that would otherwise be distributed.' },
  ]
  if (medicaid !== null && medicaid > 50) {
    drivers.push({
      label: 'Medicaid rate change',
      detail: `Medicaid is ${formatPercent(medicaid)} of revenue here. A state rate reduction reaches this facility's income directly and cannot be negotiated.`,
    })
  }

  return {
    narrative,
    drivers: drivers.slice(0, 12),
    what_would_have_to_be_true: [
      'Census stabilises at or above the level assumed in the projection.',
      'Labour costs return to a level that does not require agency staffing.',
      'The debt is refinanced at maturity on terms no worse than assumed.',
      'A buyer pays the assumed multiple in the market conditions of the exit year.',
      'No material capital event or regulatory finding occurs during the hold.',
    ],
  }
}
