import 'server-only'
import { db } from '@/db'
import { runAi } from '@/lib/ai/provider'
import { bearCaseSchema, investmentAnalysisSchema } from '@/lib/ai/schemas'
import { analyzeInvestment, bearCase, type InvestmentAnalysisInput } from '@/lib/ai/local/investment'
import { buildSnapshot } from '@/lib/deal/snapshot'
import {
  NEUTRAL_SCENARIO, project, projectScenario, SCENARIO_PRESETS, type Projection, type ProjectionInput,
} from '@/lib/equity/projections'
import { assessRisk, type RiskResult } from '@/lib/equity/risk'
import { recordAiUsage } from '../ai-usage'
import type {
  BearCasePayload, InvestmentAnalysisPayload,
} from '@/lib/ai/schemas'
import type { Offering, OfferingTerms, RiskAssessment, ScenarioInputs, ScenarioResults } from '@/types/equity'

/**
 * Investment analysis for the equity side.
 *
 * The division of labour is the same one the debt side uses, and it is the
 * reason the product can be trusted with money: every number comes from a
 * tested function, and the model is asked only to explain what those numbers
 * mean. A model that returned a different internal rate of return would be
 * ignored, because the schema it answers into has nowhere to put one.
 */

export interface OfferingAnalysis {
  offering: Offering
  terms: OfferingTerms | null
  projection: Projection
  risk: RiskResult
  analysis: InvestmentAnalysisPayload
  /** Where the analysis came from, so the screen can attribute it honestly. */
  generatedBy: string
}

/** Assembles the inputs the projection engine needs from a deal and an offering. */
export async function projectionInputFor(
  offeringId: string,
): Promise<{ input: ProjectionInput; offering: Offering; terms: OfferingTerms | null } | null> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) return null
  const [terms, snapshot] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    buildSnapshot(offering.deal_id),
  ])
  if (!snapshot) return null

  const assumptions = terms?.assumptions
  const input: ProjectionInput = {
    revenue: snapshot.latest?.items.revenue ?? null,
    ebitda: snapshot.latest?.items.ebitda ?? null,
    noi: snapshot.summary.noi,
    loanAmount: snapshot.summary.loanAmount,
    ratePct: snapshot.assumedTerms.ratePct,
    amortizationMonths: snapshot.assumedTerms.amortizationMonths,
    interestOnlyMonths: snapshot.terms?.requested_io_months ?? 0,
    investorEquity: offering.target_raise,
    totalEquity: snapshot.summary.equityRequirement ?? offering.target_raise,
    purchasePrice: snapshot.terms?.purchase_price ?? null,
    holdYears: assumptions?.hold_years ?? (terms?.target_hold_months ? terms.target_hold_months / 12 : null),
    revenueGrowthPct: assumptions?.revenue_growth_pct ?? null,
    expenseGrowthPct: assumptions?.expense_growth_pct ?? null,
    exitCapRatePct: assumptions?.exit_cap_rate_pct ?? null,
    exitMultipleOfEbitda: assumptions?.exit_multiple_of_ebitda ?? null,
    sellingCostsPct: assumptions?.selling_costs_pct ?? null,
    preferredReturnPct: terms?.preferred_return_pct ?? null,
  }
  return { input, offering, terms }
}

async function analysisInput(offeringId: string): Promise<InvestmentAnalysisInput | null> {
  const store = await db()
  const assembled = await projectionInputFor(offeringId)
  if (!assembled) return null
  const { input, offering, terms } = assembled
  const snapshot = await buildSnapshot(offering.deal_id)
  if (!snapshot) return null

  const openDiscrepancies = await store.count('discrepancies', {
    where: { deal_id: offering.deal_id, status: 'open' },
  })
  const documents = await store.select('documents', {
    where: { deal_id: offering.deal_id, deleted_at: { isNull: true } },
  })

  const projection = project(input)
  const risk = assessRisk({
    dscr: snapshot.summary.dscr,
    ltvPct: snapshot.summary.ltv === null ? null : snapshot.summary.ltv * 100,
    debtYieldPct: snapshot.summary.debtYield === null ? null : snapshot.summary.debtYield * 100,
    ebitdaMarginPct: snapshot.summary.ebitdaMargin === null ? null : snapshot.summary.ebitdaMargin * 100,
    occupancyPct: snapshot.metrics?.occupancy_pct ?? null,
    medicaidPct: snapshot.metrics?.medicaid_pct ?? null,
    agencyLaborPct: agencyShare(snapshot),
    yearsOperating: snapshot.sponsor?.years_in_healthcare ?? null,
    facilitiesOperated: snapshot.sponsor?.facilities_operated ?? null,
    leveragePct: snapshot.summary.loanAmount !== null && snapshot.summary.totalCost
      ? snapshot.summary.loanAmount / snapshot.summary.totalCost
      : null,
    targetHoldMonths: terms?.target_hold_months ?? null,
    hasAppraisal: documents.some((d) => d.doc_type === 'appraisal'),
    openDiscrepancies,
  })

  return { snapshot, offering, terms, projection, risk, openDiscrepancies }
}

function agencyShare(snapshot: Awaited<ReturnType<typeof buildSnapshot>>): number | null {
  const agency = snapshot?.latest?.items.agency_labor ?? null
  const labor = snapshot?.latest?.items.labor_expense ?? null
  if (agency === null || labor === null || labor <= 0) return null
  return (agency / labor) * 100
}

/**
 * Runs the analysis for an offering.
 *
 * The projection and risk assessment are computed first and passed to the
 * model as context. The model cannot change them; it can only describe them.
 */
export async function analyzeOffering(offeringId: string): Promise<OfferingAnalysis | null> {
  const assembled = await analysisInput(offeringId)
  if (!assembled) return null

  const result = await runAi({
    task: 'reasoning',
    instruction:
      'Write an investment analysis of the supplied offering for a prospective investor. Use only the figures supplied; every projected figure has already been computed and must not be restated differently. Do not recommend that anyone invest, do not describe any return as guaranteed or expected, and do not give personalised investment advice.',
    schema: investmentAnalysisSchema,
    schemaName: 'InvestmentAnalysis',
    schemaHint: '{ thesis, strengths[], risks[{title,severity,detail,category}], key_assumptions[], questions_to_ask[], missing_information[], downside_considerations[], confidence }',
    context: {
      offering: assembled.offering,
      terms: assembled.terms,
      deal: assembled.snapshot.deal,
      facility: assembled.snapshot.facility,
      computed: assembled.snapshot.summary,
      projection: assembled.projection,
      risk: assembled.risk,
    },
    local: () => analyzeInvestment(assembled),
  })

  await recordAiUsage({
    dealId: assembled.offering.deal_id,
    task: 'reasoning',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  await persistRisk(assembled.offering, assembled.risk)

  return {
    offering: assembled.offering,
    terms: assembled.terms,
    projection: assembled.projection,
    risk: assembled.risk,
    analysis: result.data,
    generatedBy: result.provider,
  }
}

/**
 * The bear case: a downside scenario computed by the projection engine, with a
 * narrative explaining what it means.
 */
export async function runBearCase(
  offeringId: string,
  scenario: ScenarioInputs = SCENARIO_PRESETS.downside,
): Promise<{ results: ScenarioResults; narrative: BearCasePayload } | null> {
  const assembled = await analysisInput(offeringId)
  if (!assembled) return null
  const projectionInput = await projectionInputFor(offeringId)
  if (!projectionInput) return null

  const results = projectScenario(projectionInput.input, scenario)

  const result = await runAi({
    task: 'reasoning',
    instruction:
      'Explain the supplied downside scenario for a prospective investor. The figures have already been computed and must not be restated differently or improved upon. Do not reassure; the purpose of this section is to describe how the investment loses money.',
    schema: bearCaseSchema,
    schemaName: 'BearCase',
    schemaHint: '{ narrative, drivers[{label,detail}], what_would_have_to_be_true[] }',
    context: {
      offering: assembled.offering,
      computed: assembled.snapshot.summary,
      scenario,
      results,
    },
    local: () => bearCase(assembled, results),
  })

  await recordAiUsage({
    dealId: assembled.offering.deal_id,
    task: 'reasoning',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  return { results, narrative: result.data }
}

/** Runs every named scenario, for the comparison table. */
export async function runScenarios(offeringId: string): Promise<Record<string, ScenarioResults> | null> {
  const projectionInput = await projectionInputFor(offeringId)
  if (!projectionInput) return null
  const out: Record<string, ScenarioResults> = {}
  for (const [name, scenario] of Object.entries(SCENARIO_PRESETS)) {
    out[name] = projectScenario(projectionInput.input, scenario)
  }
  return out
}

/** Runs one scenario with the investor's own adjustments. */
export async function runCustomScenario(
  offeringId: string,
  overrides: Partial<ScenarioInputs>,
): Promise<ScenarioResults | null> {
  const projectionInput = await projectionInputFor(offeringId)
  if (!projectionInput) return null
  return projectScenario(projectionInput.input, { ...NEUTRAL_SCENARIO, ...overrides })
}

async function persistRisk(offering: Offering, risk: RiskResult): Promise<void> {
  const store = await db()
  await store.insert('risk_assessments', {
    offering_id: offering.id,
    deal_id: offering.deal_id,
    overall_score: risk.overallScore,
    overall_band: risk.overallBand,
    coverage: risk.coverage,
    categories: risk.categories,
  } as Omit<RiskAssessment, 'id' | 'created_at'>)
}

/** Runs the projection alone, for screens that show economics without narrative. */
export async function projectOffering(offeringId: string): Promise<Projection | null> {
  const assembled = await projectionInputFor(offeringId)
  if (!assembled) return null
  return project(assembled.input)
}

/**
 * The commitment calculator: what a specific amount buys.
 *
 * Scales the offering-level projection by the investor's share. Every figure
 * it returns is labelled projected wherever it is displayed.
 */
export async function projectInvestment(
  offeringId: string,
  amount: number,
): Promise<{
  ownershipPct: number | null
  projectedDistributions: number | null
  projectedExitProceeds: number | null
  projectedTotal: number | null
  projectedMultiple: number | null
  projectedIrrPct: number | null
  insufficientData: string | null
} | null> {
  const assembled = await projectionInputFor(offeringId)
  if (!assembled) return null
  const projection = project(assembled.input)
  const raise = assembled.offering.target_raise

  if (projection.insufficientData !== null || raise === null || raise <= 0) {
    return {
      ownershipPct: null, projectedDistributions: null, projectedExitProceeds: null,
      projectedTotal: null, projectedMultiple: null, projectedIrrPct: null,
      insufficientData: projection.insufficientData
        ?? 'This offering has not stated a target raise, so a share of it cannot be computed.',
    }
  }

  const share = amount / raise
  return {
    ownershipPct: share,
    projectedDistributions: scale(projection.investorDistributions, share),
    projectedExitProceeds: scale(projection.investorExitProceeds, share),
    projectedTotal: scale(projection.investorTotal, share),
    // Multiple and rate are ratios: an investor's share does not change them.
    projectedMultiple: projection.equityMultiple,
    projectedIrrPct: projection.irrPct,
    insufficientData: null,
  }
}

function scale(value: number | null, share: number): number | null {
  return value === null ? null : Math.round(value * share * 100) / 100
}

// ---------------------------------------------------------------------------
// Ask the offering
// ---------------------------------------------------------------------------

/** Questions an investor is most often served by asking first. */
export const INVESTOR_SUGGESTED_QUESTIONS = [
  'What are the biggest risks in this investment?',
  'How much debt is on the property, and on what terms?',
  'What happens to distributions if occupancy falls to 80%?',
  'How is the projected return calculated?',
  'What assumptions drive the exit valuation?',
  'What percentage of revenue comes from Medicaid?',
  'How experienced is the sponsor?',
  'Show me every assumption behind the projections.',
] as const

/**
 * Answers an investor's question about an offering.
 *
 * Reuses the deal intelligence the debt side already has, with the offering's
 * own terms, projections and risk assessment added to the context — so a
 * question about the exit assumption or the preferred return can be answered
 * from the record rather than deflected.
 *
 * The answer is only ever assembled from supplied context. A question the
 * record cannot answer comes back saying so, which is the whole point: an
 * investor who is told "the record does not say" has learned something true.
 */
export async function askOffering(
  offeringId: string,
  question: string,
): Promise<import('@/lib/ai/schemas').DealChatAnswer & { offeringContext: boolean }> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) throw new Error('Offering not found.')

  const assembled = await analysisInput(offeringId)
  const { askDeal } = await import('@/services/chat')

  // The deal-level answer carries the citations, which is what makes it
  // trustworthy; the offering context is appended to the question so the model
  // and the local analyst both see the terms an investor is actually asking about.
  const framing = assembled
    ? [
      `Offering: ${offering.name}, ${offering.offering_type}.`,
      offering.target_raise ? `Raising ${offering.target_raise}.` : null,
      assembled.terms?.target_hold_months ? `Target hold ${assembled.terms.target_hold_months / 12} years.` : null,
      assembled.terms?.preferred_return_pct ? `Preferred return ${assembled.terms.preferred_return_pct * 100}%.` : null,
      assembled.projection.insufficientData === null && assembled.projection.irrPct !== null
        ? `Projected internal rate of return ${assembled.projection.irrPct}% and equity multiple ${assembled.projection.equityMultiple}, from the sponsor's stated assumptions: ${assembled.projection.assumptionsUsed.map((a) => `${a.label} ${a.value}`).join('; ')}.`
        : 'Returns cannot be projected because the sponsor has not stated the required assumptions.',
      assembled.risk.categories.map((c) => `${c.category} risk ${c.band}: ${c.rationale}`).join(' '),
    ].filter(Boolean).join(' ')
    : ''

  const answer = await askDeal(
    offering.deal_id,
    framing ? `${question}\n\nOffering context: ${framing}` : question,
  )
  return { ...answer, offeringContext: Boolean(framing) }
}
