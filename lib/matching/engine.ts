/**
 * Deterministic lender matching.
 *
 * Compatibility is computed in code from the lender's stated lending box and
 * the deal's underwritten metrics. The AI layer only ever adds a qualitative
 * explanation on top of this result — it never moves the score, which is what
 * lets us show a borrower exactly why a lender scored the way it did.
 *
 * Two ideas matter here:
 *  - A *hard fail* is a criterion the lender stated as a boundary (loan size,
 *    excluded state, maximum LTV, minimum DSCR). Failing one puts the deal
 *    outside the box no matter how well everything else scores.
 *  - *Unknown* is not the same as *bad*. A metric the borrower has not provided
 *    scores at half credit and is surfaced as a concern, so an incomplete deal
 *    ranks below a complete one without being wrongly disqualified.
 */
import type { AssetType, MatchFactor, TransactionType } from '@/types'

export interface MatchableDeal {
  assetType: AssetType
  transactionType: TransactionType
  state: string
  loanAmount: number | null
  ltvPct: number | null
  dscr: number | null
  debtYieldPct: number | null
  occupancyPct: number | null
  medicaidPct: number | null
  privatePayPct: number | null
  sponsorYearsExperience: number | null
  sponsorFacilitiesOperated: number | null
  daysToClose: number | null
}

export interface MatchableBox {
  minLoan: number | null
  maxLoan: number | null
  maxLtvPct: number | null
  minDscr: number | null
  minDebtYieldPct: number | null
  minOccupancyPct: number | null
  states: string[]
  excludedStates: string[]
  assetTypes: AssetType[]
  excludedAssetTypes: AssetType[]
  transactionTypes: TransactionType[]
  minOperatorYears: number | null
  minFacilitiesOperated: number | null
  maxMedicaidPct: number | null
  minPrivatePayPct: number | null
  preferredDealSize: number | null
}

export interface MatchResult {
  score: number
  band: 'strong' | 'good' | 'possible' | 'outside_box'
  hardFail: boolean
  factors: MatchFactor[]
  reasons: string[]
  concerns: string[]
}

const WEIGHTS = {
  loan_size: 15,
  asset_type: 15,
  geography: 12,
  ltv: 12,
  dscr: 12,
  debt_yield: 8,
  transaction_type: 8,
  occupancy: 6,
  sponsor: 6,
  payer_mix: 6,
} as const

const ASSET_LABELS: Record<AssetType, string> = {
  snf: 'Skilled nursing', alf: 'Assisted living', memory_care: 'Memory care',
  behavioral_health: 'Behavioral health', medical_office: 'Medical office', hospital: 'Hospital',
  home_health: 'Home health', hospice: 'Hospice', physician_practice: 'Physician practice',
  dental_practice: 'Dental practice', other: 'Other healthcare',
}

const TRANSACTION_LABELS: Record<TransactionType, string> = {
  acquisition: 'Acquisition', refinance: 'Refinance', acquisition_refinance: 'Acquisition + refinance',
  bridge: 'Bridge', construction: 'Construction', capex: 'CapEx', working_capital: 'Working capital',
  recapitalization: 'Recapitalization',
}

/** A criterion the borrower has not answered yet: half credit, flagged. */
function unknown(key: keyof typeof WEIGHTS, label: string, detail: string): MatchFactor {
  return { key, label, status: 'unknown', weight: WEIGHTS[key], score: WEIGHTS[key] * 0.5, detail }
}

function pass(key: keyof typeof WEIGHTS, label: string, detail: string, ratio = 1): MatchFactor {
  return { key, label, status: 'pass', weight: WEIGHTS[key], score: WEIGHTS[key] * ratio, detail }
}

function concern(key: keyof typeof WEIGHTS, label: string, detail: string, ratio = 0.4): MatchFactor {
  return { key, label, status: 'concern', weight: WEIGHTS[key], score: WEIGHTS[key] * ratio, detail }
}

function fail(key: keyof typeof WEIGHTS, label: string, detail: string): MatchFactor {
  return { key, label, status: 'fail', weight: WEIGHTS[key], score: 0, detail }
}

/**
 * Scores how comfortably a value sits inside a one-sided limit.
 *
 * A deal at exactly the lender's maximum LTV is a technical pass but a weaker
 * fit than one ten points inside it, and this is what expresses that.
 */
function headroomRatio(value: number, limit: number, direction: 'below' | 'above'): number {
  if (limit === 0) return 1
  const headroom = direction === 'below' ? (limit - value) / limit : (value - limit) / limit
  return Math.min(1, 0.75 + Math.max(headroom, 0) * 2.5)
}

export function matchDeal(deal: MatchableDeal, box: MatchableBox): MatchResult {
  const factors: MatchFactor[] = []
  const hardFails: string[] = []

  // --- Loan size ----------------------------------------------------------
  if (deal.loanAmount === null) {
    factors.push(unknown('loan_size', 'Loan size', 'Requested financing amount not yet provided.'))
  } else {
    const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`
    if (box.minLoan !== null && deal.loanAmount < box.minLoan) {
      factors.push(fail('loan_size', 'Loan size', `Request of ${money(deal.loanAmount)} is below the ${money(box.minLoan)} minimum.`))
      hardFails.push('loan size below minimum')
    } else if (box.maxLoan !== null && deal.loanAmount > box.maxLoan) {
      factors.push(fail('loan_size', 'Loan size', `Request of ${money(deal.loanAmount)} exceeds the ${money(box.maxLoan)} maximum.`))
      hardFails.push('loan size above maximum')
    } else {
      // Reward proximity to the lender's sweet spot when one is stated.
      let ratio = 1
      let detail = `Loan size within range.`
      if (box.preferredDealSize) {
        const distance = Math.abs(deal.loanAmount - box.preferredDealSize) / box.preferredDealSize
        ratio = Math.max(0.8, 1 - distance * 0.4)
        if (distance <= 0.25) detail = `Loan size at the lender's typical ${money(box.preferredDealSize)} check size.`
      }
      factors.push(pass('loan_size', 'Loan size', detail, ratio))
    }
  }

  // --- Asset type ---------------------------------------------------------
  const assetLabel = ASSET_LABELS[deal.assetType]
  if (box.excludedAssetTypes.includes(deal.assetType)) {
    factors.push(fail('asset_type', 'Asset type', `${assetLabel} is on the lender's excluded list.`))
    hardFails.push('asset type excluded')
  } else if (box.assetTypes.length && !box.assetTypes.includes(deal.assetType)) {
    factors.push(fail('asset_type', 'Asset type', `Lender does not state an appetite for ${assetLabel.toLowerCase()}.`))
    hardFails.push('asset type outside stated appetite')
  } else {
    factors.push(pass('asset_type', 'Asset type', `${assetLabel} accepted.`))
  }

  // --- Geography ----------------------------------------------------------
  const state = deal.state?.toUpperCase() ?? ''
  if (!state) {
    factors.push(unknown('geography', 'Geography', 'Facility state not yet provided.'))
  } else if (box.excludedStates.map((s) => s.toUpperCase()).includes(state)) {
    factors.push(fail('geography', 'Geography', `${state} is on the lender's excluded list.`))
    hardFails.push('state excluded')
  } else if (box.states.length && !box.states.map((s) => s.toUpperCase()).includes(state)) {
    factors.push(fail('geography', 'Geography', `Lender does not currently lend in ${state}.`))
    hardFails.push('state outside footprint')
  } else {
    factors.push(pass('geography', 'Geography', `${state} accepted.`))
  }

  // --- LTV ----------------------------------------------------------------
  if (deal.ltvPct === null) {
    factors.push(unknown('ltv', 'Leverage (LTV)', 'LTV not yet calculable — value or loan amount missing.'))
  } else if (box.maxLtvPct === null) {
    factors.push(pass('ltv', 'Leverage (LTV)', `Lender states no maximum LTV; deal is at ${deal.ltvPct.toFixed(1)}%.`, 0.9))
  } else if (deal.ltvPct > box.maxLtvPct) {
    factors.push(fail('ltv', 'Leverage (LTV)', `${deal.ltvPct.toFixed(1)}% exceeds the ${box.maxLtvPct}% maximum.`))
    hardFails.push('LTV above maximum')
  } else {
    const ratio = headroomRatio(deal.ltvPct, box.maxLtvPct, 'below')
    factors.push(pass('ltv', 'Leverage (LTV)', `${deal.ltvPct.toFixed(1)}% is within the ${box.maxLtvPct}% maximum.`, ratio))
  }

  // --- DSCR ---------------------------------------------------------------
  if (deal.dscr === null) {
    factors.push(unknown('dscr', 'Debt service coverage', 'DSCR not yet calculable — cash flow or loan terms missing.'))
  } else if (box.minDscr === null) {
    factors.push(pass('dscr', 'Debt service coverage', `Lender states no DSCR floor; deal covers at ${deal.dscr.toFixed(2)}x.`, 0.9))
  } else if (deal.dscr < box.minDscr) {
    factors.push(fail('dscr', 'Debt service coverage', `${deal.dscr.toFixed(2)}x is below the ${box.minDscr.toFixed(2)}x minimum.`))
    hardFails.push('DSCR below minimum')
  } else {
    const ratio = headroomRatio(deal.dscr, box.minDscr, 'above')
    factors.push(pass('dscr', 'Debt service coverage', `${deal.dscr.toFixed(2)}x exceeds the ${box.minDscr.toFixed(2)}x minimum.`, ratio))
  }

  // --- Debt yield ---------------------------------------------------------
  if (deal.debtYieldPct === null) {
    factors.push(unknown('debt_yield', 'Debt yield', 'Debt yield not yet calculable.'))
  } else if (box.minDebtYieldPct === null) {
    factors.push(pass('debt_yield', 'Debt yield', `Deal debt yield is ${deal.debtYieldPct.toFixed(1)}%.`, 0.9))
  } else if (deal.debtYieldPct < box.minDebtYieldPct) {
    factors.push(concern('debt_yield', 'Debt yield', `${deal.debtYieldPct.toFixed(1)}% is below the ${box.minDebtYieldPct}% target.`))
  } else {
    factors.push(pass('debt_yield', 'Debt yield', `${deal.debtYieldPct.toFixed(1)}% meets the ${box.minDebtYieldPct}% minimum.`))
  }

  // --- Transaction type ---------------------------------------------------
  const txLabel = TRANSACTION_LABELS[deal.transactionType]
  if (box.transactionTypes.length && !box.transactionTypes.includes(deal.transactionType)) {
    factors.push(fail('transaction_type', 'Transaction type', `Lender does not state appetite for ${txLabel.toLowerCase()} financing.`))
    hardFails.push('transaction type outside stated appetite')
  } else {
    factors.push(pass('transaction_type', 'Transaction type', `${txLabel} financing accepted.`))
  }

  // --- Occupancy ----------------------------------------------------------
  if (deal.occupancyPct === null) {
    factors.push(unknown('occupancy', 'Occupancy', 'Current occupancy not yet provided.'))
  } else if (box.minOccupancyPct === null) {
    factors.push(pass('occupancy', 'Occupancy', `Occupancy of ${deal.occupancyPct.toFixed(1)}%.`, 0.9))
  } else if (deal.occupancyPct < box.minOccupancyPct) {
    factors.push(concern('occupancy', 'Occupancy', `${deal.occupancyPct.toFixed(1)}% is below the ${box.minOccupancyPct}% preference.`))
  } else {
    factors.push(pass('occupancy', 'Occupancy', `${deal.occupancyPct.toFixed(1)}% meets the ${box.minOccupancyPct}% preference.`))
  }

  // --- Sponsor ------------------------------------------------------------
  const years = deal.sponsorYearsExperience
  const facilities = deal.sponsorFacilitiesOperated
  if (years === null && facilities === null) {
    factors.push(unknown('sponsor', 'Sponsor experience', 'Sponsor operating history not yet provided.'))
  } else {
    const yearsShort = box.minOperatorYears !== null && years !== null && years < box.minOperatorYears
    const facilitiesShort =
      box.minFacilitiesOperated !== null && facilities !== null && facilities < box.minFacilitiesOperated
    if (yearsShort || facilitiesShort) {
      const detail = yearsShort
        ? `${years} years operating experience is below the ${box.minOperatorYears}-year preference.`
        : `${facilities} facilities operated is below the ${box.minFacilitiesOperated}-facility preference.`
      factors.push(concern('sponsor', 'Sponsor experience', detail))
    } else {
      const detail = years !== null
        ? `${years} years of healthcare operating experience.`
        : `${facilities} facilities under management.`
      factors.push(pass('sponsor', 'Sponsor experience', detail))
    }
  }

  // --- Payer mix ----------------------------------------------------------
  if (deal.medicaidPct === null && deal.privatePayPct === null) {
    factors.push(unknown('payer_mix', 'Payer mix', 'Payer mix not yet provided.'))
  } else {
    const medicaidOver =
      box.maxMedicaidPct !== null && deal.medicaidPct !== null && deal.medicaidPct > box.maxMedicaidPct
    const privateUnder =
      box.minPrivatePayPct !== null && deal.privatePayPct !== null && deal.privatePayPct < box.minPrivatePayPct
    if (medicaidOver) {
      factors.push(concern('payer_mix', 'Payer mix', `Medicaid at ${deal.medicaidPct!.toFixed(0)}% exceeds the lender's ${box.maxMedicaidPct}% preference.`))
    } else if (privateUnder) {
      factors.push(concern('payer_mix', 'Payer mix', `Private pay at ${deal.privatePayPct!.toFixed(0)}% is below the lender's ${box.minPrivatePayPct}% preference.`))
    } else {
      const detail = deal.medicaidPct !== null
        ? `Payer mix within preference (Medicaid ${deal.medicaidPct.toFixed(0)}%).`
        : `Payer mix within preference.`
      factors.push(pass('payer_mix', 'Payer mix', detail))
    }
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const earned = factors.reduce((sum, f) => sum + f.score, 0)
  const rawScore = totalWeight > 0 ? (earned / totalWeight) * 100 : 0
  const hardFail = hardFails.length > 0
  const score = Math.round(hardFail ? Math.min(rawScore, 45) : rawScore)

  return {
    score,
    band: bandFor(score, hardFail),
    hardFail,
    factors,
    reasons: factors.filter((f) => f.status === 'pass').map((f) => f.detail),
    concerns: factors.filter((f) => f.status === 'concern' || f.status === 'unknown').map((f) => f.detail),
  }
}

export function bandFor(score: number, hardFail: boolean): MatchResult['band'] {
  if (hardFail) return 'outside_box'
  if (score >= 85) return 'strong'
  if (score >= 70) return 'good'
  return 'possible'
}

export const BAND_LABELS: Record<MatchResult['band'], string> = {
  strong: 'Strong Fit',
  good: 'Good Fit',
  possible: 'Possible Fit',
  outside_box: 'Outside Lending Box',
}

/**
 * Marketplace relevance ranking.
 *
 * Deliberately not "highest bid first": relevance blends fit, how complete and
 * lender-ready the package is, how soon it closes, and how responsive the
 * lender has been. The weights are configurable so the mix can be tuned
 * without touching the ranking logic.
 */
export interface RankingInputs {
  matchScore: number
  dealQualityScore: number
  daysToClose: number | null
  lenderResponsiveness: number
  borrowerPreferenceBoost?: number
}

export interface RankingWeights {
  matchScore: number
  dealQuality: number
  timeline: number
  responsiveness: number
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  matchScore: 0.55,
  dealQuality: 0.25,
  timeline: 0.12,
  responsiveness: 0.08,
}

export function relevanceScore(inputs: RankingInputs, weights = DEFAULT_RANKING_WEIGHTS): number {
  // A closing 30 days out scores 100; one a year out scores near zero.
  const timeline =
    inputs.daysToClose === null ? 50 : Math.max(0, Math.min(100, 100 - (inputs.daysToClose - 30) * 0.25))
  const raw =
    inputs.matchScore * weights.matchScore +
    inputs.dealQualityScore * weights.dealQuality +
    timeline * weights.timeline +
    inputs.lenderResponsiveness * weights.responsiveness
  return Math.round(Math.min(100, raw + (inputs.borrowerPreferenceBoost ?? 0)))
}
