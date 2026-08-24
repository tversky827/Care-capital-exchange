import type { DealSnapshot } from '@/lib/deal/snapshot'
import type { ScoreComponent } from '@/types'

/**
 * Deal scoring.
 *
 * The score is published with its components visible, because an opaque number
 * is worthless to a credit officer. Two properties are deliberate:
 *
 *  - Every component reports its own `data_quality`. A component computed from
 *    missing data scores at a neutral 50 and is labelled `missing`, so a thin
 *    deal cannot accidentally score well.
 *  - The overall score is rounded to a whole number and paired with a
 *    confidence derived from data coverage. Presenting "72" alongside "based
 *    on 60% of the expected inputs" is honest; presenting "72.4" is not.
 */

export const SCORE_WEIGHTS = {
  financial_strength: 0.25,
  collateral: 0.2,
  operations: 0.15,
  sponsor: 0.15,
  leverage: 0.15,
  data_quality: 0.1,
} as const

export interface DealScore {
  overall: number
  confidence: number
  components: ScoreComponent[]
  /** Share of the expected inputs that were actually available. */
  coverage: number
}

/** Maps a value onto 0–100 against a band where `good` scores 85 and `weak` scores 35. */
function band(value: number, weak: number, good: number, higherIsBetter = true): number {
  const [low, high] = higherIsBetter ? [weak, good] : [good, weak]
  const clamped = Math.max(Math.min(value, Math.max(low, high)), Math.min(low, high))
  const ratio = (clamped - low) / (high - low || 1)
  return Math.round(Math.max(0, Math.min(100, 35 + ratio * 50)))
}

function component(
  key: keyof typeof SCORE_WEIGHTS,
  label: string,
  score: number | null,
  rationale: string,
  quality: ScoreComponent['data_quality'],
): ScoreComponent {
  return {
    key,
    label,
    weight: SCORE_WEIGHTS[key],
    score: score === null ? 50 : Math.round(Math.max(0, Math.min(100, score))),
    rationale,
    data_quality: quality,
  }
}

export function scoreDeal(snapshot: DealSnapshot): DealScore {
  const { summary, facility, sponsor, metrics, latest, prior } = snapshot
  const components: ScoreComponent[] = []

  // --- Financial strength: coverage, margin and direction of travel --------
  {
    const signals: number[] = []
    const notes: string[] = []
    if (summary.dscr !== null) {
      signals.push(band(summary.dscr, 1.1, 1.9))
      notes.push(`${summary.dscr.toFixed(2)}x coverage`)
    }
    if (summary.ebitdaMargin !== null) {
      signals.push(band(summary.ebitdaMargin, 5, 18))
      notes.push(`${summary.ebitdaMargin.toFixed(1)}% EBITDA margin`)
    }
    if (summary.ebitdaGrowthPct !== null) {
      signals.push(band(summary.ebitdaGrowthPct, -15, 15))
      notes.push(`EBITDA ${summary.ebitdaGrowthPct >= 0 ? 'up' : 'down'} ${Math.abs(summary.ebitdaGrowthPct).toFixed(1)}%`)
    }
    const quality: ScoreComponent['data_quality'] =
      signals.length >= 3 ? 'complete' : signals.length >= 1 ? 'partial' : 'missing'
    components.push(
      component(
        'financial_strength',
        'Financial strength',
        signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null,
        signals.length ? notes.join(', ') + '.' : 'Operating statements not yet available.',
        quality,
      ),
    )
  }

  // --- Collateral: value support and debt yield ---------------------------
  {
    const signals: number[] = []
    const notes: string[] = []
    if (summary.debtYield !== null) {
      signals.push(band(summary.debtYield, 8, 16))
      notes.push(`${summary.debtYield.toFixed(1)}% debt yield`)
    }
    if (snapshot.terms?.appraised_value && snapshot.terms.purchase_price) {
      const ratio = snapshot.terms.appraised_value / snapshot.terms.purchase_price
      signals.push(band(ratio * 100, 92, 108))
      notes.push(ratio >= 1 ? 'appraisal supports the contract price' : 'appraisal below the contract price')
    }
    if (facility?.year_built) {
      const age = new Date().getFullYear() - (facility.last_renovation_year ?? facility.year_built)
      signals.push(band(age, 40, 5, false))
      notes.push(`${age} years since ${facility.last_renovation_year ? 'renovation' : 'construction'}`)
    }
    const quality: ScoreComponent['data_quality'] =
      signals.length >= 3 ? 'complete' : signals.length >= 1 ? 'partial' : 'missing'
    components.push(
      component(
        'collateral',
        'Collateral',
        signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null,
        signals.length ? notes.join(', ') + '.' : 'Valuation and property detail not yet available.',
        quality,
      ),
    )
  }

  // --- Operations: occupancy, payer mix, agency reliance ------------------
  {
    const signals: number[] = []
    const notes: string[] = []
    const occupancy = facility?.occupancy_pct ?? metrics?.occupancy_pct ?? summary.occupancyPct
    if (occupancy !== null && occupancy !== undefined) {
      signals.push(band(occupancy, 70, 92))
      notes.push(`${occupancy.toFixed(1)}% occupancy`)
    }
    if (metrics?.medicaid_pct != null) {
      signals.push(band(metrics.medicaid_pct, 80, 40, false))
      notes.push(`${metrics.medicaid_pct.toFixed(0)}% Medicaid`)
    }
    if (latest?.items.agency_labor != null && latest.items.labor_expense) {
      const agencyShare = (latest.items.agency_labor / latest.items.labor_expense) * 100
      signals.push(band(agencyShare, 15, 1, false))
      notes.push(`agency at ${agencyShare.toFixed(1)}% of labor`)
    }
    const quality: ScoreComponent['data_quality'] =
      signals.length >= 3 ? 'complete' : signals.length >= 1 ? 'partial' : 'missing'
    components.push(
      component(
        'operations',
        'Operations',
        signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null,
        signals.length ? notes.join(', ') + '.' : 'Operating detail not yet provided.',
        quality,
      ),
    )
  }

  // --- Sponsor -----------------------------------------------------------
  {
    const signals: number[] = []
    const notes: string[] = []
    if (sponsor?.years_in_healthcare != null) {
      signals.push(band(sponsor.years_in_healthcare, 2, 20))
      notes.push(`${sponsor.years_in_healthcare} years in healthcare`)
    }
    if (sponsor?.facilities_operated != null) {
      signals.push(band(sponsor.facilities_operated, 1, 12))
      notes.push(`${sponsor.facilities_operated} facilities operated`)
    }
    if (sponsor?.prior_defaults) {
      signals.push(20)
      notes.push('prior default disclosed')
    }
    if (sponsor?.liquidity != null && snapshot.summary.equityRequirement) {
      const coverage = sponsor.liquidity / Math.max(snapshot.summary.equityRequirement, 1)
      signals.push(band(coverage * 100, 40, 150))
      notes.push(`liquidity covers ${(coverage * 100).toFixed(0)}% of required equity`)
    }
    const quality: ScoreComponent['data_quality'] =
      signals.length >= 3 ? 'complete' : signals.length >= 1 ? 'partial' : 'missing'
    components.push(
      component(
        'sponsor',
        'Sponsor',
        signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null,
        signals.length ? notes.join(', ') + '.' : 'Sponsor background not yet provided.',
        quality,
      ),
    )
  }

  // --- Leverage ----------------------------------------------------------
  {
    const signals: number[] = []
    const notes: string[] = []
    if (summary.ltv !== null) {
      signals.push(band(summary.ltv, 85, 60, false))
      notes.push(`${summary.ltv.toFixed(1)}% LTV`)
    }
    if (summary.loanToCost !== null) {
      signals.push(band(summary.loanToCost, 90, 65, false))
      notes.push(`${summary.loanToCost.toFixed(1)}% loan-to-cost`)
    }
    const quality: ScoreComponent['data_quality'] =
      signals.length >= 2 ? 'complete' : signals.length === 1 ? 'partial' : 'missing'
    components.push(
      component(
        'leverage',
        'Leverage',
        signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null,
        signals.length ? notes.join(', ') + '.' : 'Loan request or value basis not yet provided.',
        quality,
      ),
    )
  }

  // --- Data quality ------------------------------------------------------
  {
    const checks: [boolean, string][] = [
      [snapshot.periods.length >= 2, 'multiple historical periods'],
      [Boolean(prior), 'year-over-year comparison available'],
      [snapshot.documents.length >= 4, 'supporting documents uploaded'],
      [Boolean(metrics), 'census and payer detail provided'],
      [Boolean(sponsor), 'sponsor profile completed'],
      [snapshot.openDiscrepancies.length === 0, 'no unresolved discrepancies'],
      [snapshot.periods.every((p) => p.pending.length === 0), 'extracted values reviewed'],
    ]
    const passed = checks.filter(([ok]) => ok)
    const score = (passed.length / checks.length) * 100
    const missing = checks.filter(([ok]) => !ok).map(([, label]) => label)
    components.push(
      component(
        'data_quality',
        'Data quality',
        score,
        missing.length ? `Outstanding: ${missing.join(', ')}.` : 'All expected inputs are present and reviewed.',
        missing.length === 0 ? 'complete' : missing.length <= 3 ? 'partial' : 'missing',
      ),
    )
  }

  const overall = components.reduce((sum, c) => sum + c.score * c.weight, 0)
  const coverageWeights = components.reduce(
    (sum, c) => sum + c.weight * (c.data_quality === 'complete' ? 1 : c.data_quality === 'partial' ? 0.5 : 0),
    0,
  )

  return {
    overall: Math.round(overall),
    // Confidence tracks coverage: a score built on half the inputs says so.
    confidence: Math.round(Math.max(0.25, Math.min(0.95, coverageWeights)) * 100) / 100,
    components,
    coverage: Math.round(coverageWeights * 100),
  }
}

export function scoreBand(score: number): { label: string; tone: 'strong' | 'solid' | 'watch' | 'weak' } {
  if (score >= 80) return { label: 'Strong', tone: 'strong' }
  if (score >= 65) return { label: 'Solid', tone: 'solid' }
  if (score >= 50) return { label: 'Watch', tone: 'watch' }
  return { label: 'Challenged', tone: 'weak' }
}
