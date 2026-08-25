import { round } from '@/lib/finance/calculations'
import type { AssetType, Deal, Facility } from '@/types'
import type {
  CapitalPosition, InvestorPreferences, InvestorProfile, Offering, OfferingTerms,
} from '@/types/equity'

/**
 * Investor matching.
 *
 * Deliberately the same shape as the lender match engine: deterministic, with
 * every factor visible and the concerns that pulled a score down shown next to
 * the reasons that lifted it. A language model may narrate the result; it
 * never produces the score.
 *
 * The language matters as much as the arithmetic. A match is a statement about
 * stated preferences — "this has the characteristics you said you look for" —
 * and never a recommendation to invest. Nothing in this module, or anything
 * rendering its output, may say otherwise.
 */

export interface MatchInput {
  offering: Pick<Offering, 'id' | 'deal_id' | 'target_raise' | 'minimum_investment'>
  terms: Pick<OfferingTerms, 'capital_position' | 'target_hold_months' | 'target_irr_pct'> | null
  deal: Pick<Deal, 'asset_type'>
  facility: Pick<Facility, 'state'> | null
  /** Leverage on the deal as a fraction of total capitalisation, when known. */
  leveragePct: number | null
  investor: Pick<InvestorProfile, 'id' | 'investor_type'>
  preferences: InvestorPreferences | null
  /** Set when the eligibility engine has already ruled this investor out. */
  ineligibleReason?: string | null
}

export interface MatchResult {
  score: number
  band: 'strong' | 'possible' | 'outside_preferences'
  reasons: string[]
  concerns: string[]
  ineligible: boolean
  ineligibleReason: string | null
}

/**
 * How much each factor moves the score.
 *
 * Asset type and capital position carry the most because an investor who says
 * they buy preferred equity in skilled nursing means it; geography and hold
 * period are softer, and a mismatch there is a note rather than a rejection.
 */
const WEIGHTS = {
  assetType: 24,
  capitalPosition: 20,
  investmentSize: 18,
  geography: 14,
  holdPeriod: 12,
  targetReturn: 12,
} as const

const ASSET_LABELS: Partial<Record<AssetType, string>> = {
  snf: 'skilled nursing',
  alf: 'assisted living',
  memory_care: 'memory care',
  behavioral_health: 'behavioral health',
  medical_office: 'medical office',
}

const POSITION_LABELS: Record<CapitalPosition, string> = {
  senior_debt: 'senior debt',
  mezzanine: 'mezzanine',
  preferred_equity: 'preferred equity',
  common_equity: 'common equity',
}

/** The midpoint of a stated investment range, used when no typical size is given. */
function rangeMidpoint(range: InvestorPreferences['investment_range']): number | null {
  switch (range) {
    case '25k_50k': return 37_500
    case '50k_100k': return 75_000
    case '100k_250k': return 175_000
    case '250k_500k': return 375_000
    case '500k_plus': return 750_000
    default: return null
  }
}

/**
 * Scores one investor against one offering.
 *
 * An unknown preference scores half its weight rather than zero: the investor
 * has not said they dislike it, only that they have not said. Scoring silence
 * as rejection would bury every offering for a half-filled profile.
 */
export function scoreMatch(input: MatchInput): MatchResult {
  const { offering, terms, deal, facility, preferences } = input
  const reasons: string[] = []
  const concerns: string[] = []
  let earned = 0
  let possible = 0

  const award = (weight: number, won: number) => {
    possible += weight
    earned += won
  }

  // --- asset type -----------------------------------------------------------
  const assetLabel = ASSET_LABELS[deal.asset_type] ?? deal.asset_type
  if (!preferences || preferences.asset_types.length === 0) {
    award(WEIGHTS.assetType, WEIGHTS.assetType / 2)
  } else if (preferences.asset_types.includes(deal.asset_type)) {
    award(WEIGHTS.assetType, WEIGHTS.assetType)
    reasons.push(`You look for ${assetLabel} assets.`)
  } else {
    award(WEIGHTS.assetType, 0)
    concerns.push(`This is ${assetLabel}, which is not among the asset types you listed.`)
  }

  // --- capital position -----------------------------------------------------
  const position = terms?.capital_position ?? null
  if (!preferences || preferences.capital_positions.length === 0 || position === null) {
    award(WEIGHTS.capitalPosition, WEIGHTS.capitalPosition / 2)
  } else if (preferences.capital_positions.includes(position)) {
    award(WEIGHTS.capitalPosition, WEIGHTS.capitalPosition)
    reasons.push(`It is ${POSITION_LABELS[position]}, a position you invest in.`)
  } else {
    award(WEIGHTS.capitalPosition, 0)
    concerns.push(`It is ${POSITION_LABELS[position]}; you listed ${preferences.capital_positions.map((p) => POSITION_LABELS[p]).join(' and ')}.`)
  }

  // --- investment size ------------------------------------------------------
  const typical = preferences?.typical_investment ?? rangeMidpoint(preferences?.investment_range ?? null)
  const minimum = offering.minimum_investment
  if (typical === null || minimum === null) {
    award(WEIGHTS.investmentSize, WEIGHTS.investmentSize / 2)
  } else if (minimum <= typical) {
    award(WEIGHTS.investmentSize, WEIGHTS.investmentSize)
    reasons.push(`The ${formatMoney(minimum)} minimum is within the size you invest.`)
  } else if (minimum <= typical * 1.5) {
    award(WEIGHTS.investmentSize, WEIGHTS.investmentSize / 2)
    concerns.push(`The ${formatMoney(minimum)} minimum is above the size you usually invest.`)
  } else {
    award(WEIGHTS.investmentSize, 0)
    concerns.push(`The ${formatMoney(minimum)} minimum is well above the size you usually invest.`)
  }

  // --- geography ------------------------------------------------------------
  const state = facility?.state ?? null
  if (!preferences || preferences.states.length === 0 || state === null) {
    award(WEIGHTS.geography, WEIGHTS.geography / 2)
  } else if (preferences.states.includes(state)) {
    award(WEIGHTS.geography, WEIGHTS.geography)
    reasons.push(`It is in ${state}, a state you invest in.`)
  } else {
    award(WEIGHTS.geography, 0)
    concerns.push(`It is in ${state}, which is outside the states you listed.`)
  }

  // --- hold period ----------------------------------------------------------
  const hold = terms?.target_hold_months ?? null
  const minHold = preferences?.min_hold_months ?? null
  const maxHold = preferences?.max_hold_months ?? null
  if (hold === null || (minHold === null && maxHold === null)) {
    award(WEIGHTS.holdPeriod, WEIGHTS.holdPeriod / 2)
  } else if ((minHold === null || hold >= minHold) && (maxHold === null || hold <= maxHold)) {
    award(WEIGHTS.holdPeriod, WEIGHTS.holdPeriod)
    reasons.push(`The ${Math.round(hold / 12)}-year target hold fits your range.`)
  } else {
    award(WEIGHTS.holdPeriod, 0)
    const direction = maxHold !== null && hold > maxHold ? 'longer' : 'shorter'
    concerns.push(`The ${Math.round(hold / 12)}-year target hold is ${direction} than you prefer.`)
  }

  // --- target return --------------------------------------------------------
  const targetIrr = terms?.target_irr_pct ?? null
  const wantMin = preferences?.target_return_min_pct ?? null
  if (targetIrr === null || wantMin === null) {
    award(WEIGHTS.targetReturn, WEIGHTS.targetReturn / 2)
  } else if (targetIrr >= wantMin) {
    award(WEIGHTS.targetReturn, WEIGHTS.targetReturn)
    reasons.push(`Its ${round(targetIrr, 1)}% target return meets the return you look for.`)
  } else {
    award(WEIGHTS.targetReturn, WEIGHTS.targetReturn / 3)
    concerns.push(`Its ${round(targetIrr, 1)}% target return is below the ${round(wantMin, 1)}% you look for.`)
  }

  // --- leverage, a concern only; it never earns points ---------------------
  const maxLeverage = preferences?.max_leverage_pct ?? null
  if (maxLeverage !== null && input.leveragePct !== null && input.leveragePct > maxLeverage) {
    concerns.push(`Leverage of ${round(input.leveragePct * 100, 0)}% is higher than the ${round(maxLeverage * 100, 0)}% you prefer.`)
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 50
  const ineligible = Boolean(input.ineligibleReason)

  return {
    score,
    band: ineligible ? 'outside_preferences' : score >= 80 ? 'strong' : score >= 55 ? 'possible' : 'outside_preferences',
    reasons,
    concerns,
    ineligible,
    ineligibleReason: input.ineligibleReason ?? null,
  }
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/**
 * How a match should be described to an investor.
 *
 * Kept here, next to the scoring, so the wording cannot drift from the meaning.
 * None of these phrases recommends anything.
 */
export function matchHeadline(result: MatchResult): string {
  if (result.ineligible) return 'Not currently open to you'
  switch (result.band) {
    case 'strong': return 'Consistent with your stated preferences'
    case 'possible': return 'Partially consistent with your stated preferences'
    default: return 'Outside your stated preferences'
  }
}
