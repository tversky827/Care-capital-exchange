import { round } from '@/lib/finance/calculations'
import type { RiskBand, RiskCategory, RiskCategoryScore } from '@/types/equity'

/**
 * Deterministic risk assessment of an offering.
 *
 * Scores are computed from the deal's own figures by tested code. The score is
 * a summary of stated characteristics, not a prediction and not a judgement
 * about outcomes, and every category carries the reasoning that produced it so
 * the screen can show its workings.
 *
 * A category with no data does not score zero — it is marked unavailable and
 * excluded from the total, and the coverage figure reports how much of the
 * picture was actually visible. A confident score over a thin file would be
 * the most dangerous output this module could produce.
 *
 * Higher is riskier throughout: 0 is benign, 100 is alarming.
 */

export interface RiskInput {
  dscr: number | null
  ltvPct: number | null
  debtYieldPct: number | null
  ebitdaMarginPct: number | null
  occupancyPct: number | null
  medicaidPct: number | null
  agencyLaborPct: number | null
  yearsOperating: number | null
  facilitiesOperated: number | null
  /** Fraction of total capitalisation that is debt. */
  leveragePct: number | null
  targetHoldMonths: number | null
  /** Whether the deal carries an appraisal supporting the price. */
  hasAppraisal: boolean
  /** Unresolved discrepancies between source documents. */
  openDiscrepancies: number
}

export interface RiskResult {
  overallScore: number
  overallBand: RiskBand
  coverage: number
  categories: RiskCategoryScore[]
}

function band(score: number): RiskBand {
  if (score <= 33) return 'low'
  if (score <= 66) return 'medium'
  return 'high'
}

/** Maps a measurement onto 0–100 risk, where `benign` scores 0 and `severe` scores 100. */
function scale(value: number, benign: number, severe: number): number {
  if (benign === severe) return 50
  const raw = ((value - benign) / (severe - benign)) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function assessRisk(input: RiskInput): RiskResult {
  const categories: RiskCategoryScore[] = []

  const add = (
    category: RiskCategory,
    score: number | null,
    rationale: string,
  ) => {
    categories.push({
      category,
      score: score ?? 50,
      band: band(score ?? 50),
      rationale,
      available: score !== null,
    })
  }

  // --- financial: can the deal service what it owes? ------------------------
  add('financial',
    input.dscr === null ? null : scale(input.dscr, 1.8, 1.0),
    input.dscr === null
      ? 'Debt service coverage is not computable from the information supplied.'
      : `Coverage of ${round(input.dscr, 2)}x against the proposed debt. Below 1.25x is generally considered thin for stabilised skilled nursing.`)

  // --- operational: is the business itself steady? --------------------------
  const operational = input.occupancyPct === null && input.agencyLaborPct === null
    ? null
    : Math.round(
      ((input.occupancyPct === null ? 50 : scale(input.occupancyPct, 92, 75))
        + (input.agencyLaborPct === null ? 50 : scale(input.agencyLaborPct, 2, 15))) / 2,
    )
  add('operational', operational,
    [
      input.occupancyPct === null ? null : `Occupancy of ${round(input.occupancyPct, 1)}%.`,
      input.agencyLaborPct === null ? null : `Agency labour at ${round(input.agencyLaborPct, 1)}% of labour cost.`,
      input.ebitdaMarginPct === null ? null : `EBITDA margin of ${round(input.ebitdaMarginPct, 1)}%.`,
    ].filter(Boolean).join(' ') || 'Operating figures are not available for this deal.')

  // --- leverage --------------------------------------------------------------
  add('leverage',
    input.leveragePct === null ? (input.ltvPct === null ? null : scale(input.ltvPct, 55, 85)) : scale(input.leveragePct * 100, 55, 85),
    input.leveragePct !== null
      ? `Debt is ${round(input.leveragePct * 100, 0)}% of total capitalisation.`
      : input.ltvPct !== null
        ? `Loan to value of ${round(input.ltvPct, 1)}%.`
        : 'Capital structure has not been set for this deal.')

  // --- market: payer concentration and reimbursement exposure ---------------
  add('market',
    input.medicaidPct === null ? null : scale(input.medicaidPct, 35, 80),
    input.medicaidPct === null
      ? 'Payer mix has not been supplied.'
      : `Medicaid is ${round(input.medicaidPct, 0)}% of revenue. Concentration in a single state-set rate is the sector's most common source of earnings volatility.`)

  // --- regulatory: sector-wide, adjusted for payer concentration ------------
  add('regulatory',
    input.medicaidPct === null ? null : Math.min(100, 40 + scale(input.medicaidPct, 35, 80) / 3),
    'Skilled nursing operates under state licensure and federal survey. Reimbursement is set politically and can change without regard to a facility’s own performance.')

  // --- sponsor ---------------------------------------------------------------
  const sponsor = input.yearsOperating === null && input.facilitiesOperated === null
    ? null
    : Math.round(
      ((input.yearsOperating === null ? 50 : scale(input.yearsOperating, 20, 2))
        + (input.facilitiesOperated === null ? 50 : scale(input.facilitiesOperated, 10, 1))) / 2,
    )
  add('sponsor', sponsor,
    [
      input.yearsOperating === null ? null : `${input.yearsOperating} years operating healthcare facilities.`,
      input.facilitiesOperated === null ? null : `${input.facilitiesOperated} facilities under management.`,
    ].filter(Boolean).join(' ') || 'Sponsor experience has not been supplied.')

  // --- liquidity: private positions do not trade ---------------------------
  add('liquidity',
    input.targetHoldMonths === null ? 75 : Math.min(100, 55 + scale(input.targetHoldMonths, 36, 120) / 3),
    input.targetHoldMonths === null
      ? 'No target hold has been stated. A private position cannot be assumed to be sellable before the sponsor chooses to exit.'
      : `A ${Math.round(input.targetHoldMonths / 12)}-year target hold, with no secondary market. Capital should be assumed committed for the duration.`)

  // --- exit ------------------------------------------------------------------
  const exitScore = input.debtYieldPct === null && !input.hasAppraisal
    ? null
    : Math.round(
      ((input.debtYieldPct === null ? 50 : scale(input.debtYieldPct, 14, 7))
        + (input.hasAppraisal ? 30 : 70)) / 2,
    )
  add('exit', exitScore,
    [
      input.hasAppraisal ? 'An appraisal supports the going-in basis.' : 'No appraisal is on file to support the going-in basis.',
      input.debtYieldPct === null ? null : `Debt yield of ${round(input.debtYieldPct, 1)}%.`,
      'Exit proceeds depend on capitalisation rates and lending conditions years from now, neither of which is knowable today.',
    ].filter(Boolean).join(' '))

  // --- overall ---------------------------------------------------------------
  const available = categories.filter((c) => c.available)
  const coverage = round(available.length / categories.length, 3)
  // Unavailable categories are excluded rather than assumed benign, and the
  // coverage figure carries the caveat to the surface.
  const overallScore = available.length === 0
    ? 50
    : Math.round(available.reduce((total, c) => total + c.score, 0) / available.length)

  // Unresolved contradictions between documents raise the floor: a deal whose
  // own sources disagree cannot be assessed as low risk whatever the ratios say.
  const adjusted = input.openDiscrepancies > 0
    ? Math.min(100, overallScore + Math.min(15, input.openDiscrepancies * 3))
    : overallScore

  return {
    overallScore: adjusted,
    overallBand: band(adjusted),
    coverage,
    categories,
  }
}
