import { describe, expect, it } from 'vitest'
import {
  bandFor, DEFAULT_RANKING_WEIGHTS, matchDeal, relevanceScore,
  type MatchableBox, type MatchableDeal,
} from '@/lib/matching/engine'

const deal: MatchableDeal = {
  assetType: 'snf', transactionType: 'acquisition', state: 'IL',
  loanAmount: 10_500_000, ltvPct: 75, dscr: 1.64, debtYieldPct: 12.1,
  occupancyPct: 87, medicaidPct: 62, privatePayPct: 14,
  sponsorYearsExperience: 14, sponsorFacilitiesOperated: 6, daysToClose: 75,
}

const box: MatchableBox = {
  minLoan: 3_000_000, maxLoan: 25_000_000, maxLtvPct: 80, minDscr: 1.35,
  minDebtYieldPct: 11, minOccupancyPct: 82, states: ['IL', 'IN', 'WI', 'MO'],
  excludedStates: [], assetTypes: ['snf', 'alf'], excludedAssetTypes: [],
  transactionTypes: ['acquisition', 'refinance'], minOperatorYears: 5,
  minFacilitiesOperated: 3, maxMedicaidPct: 70, minPrivatePayPct: null,
  preferredDealSize: 10_000_000,
}

describe('matchDeal', () => {
  it('scores a deal squarely inside the box as a strong fit', () => {
    const result = matchDeal(deal, box)
    expect(result.hardFail).toBe(false)
    expect(result.band).toBe('strong')
    expect(result.score).toBeGreaterThanOrEqual(85)
    expect(result.reasons.length).toBeGreaterThan(5)
  })

  it('explains every factor it scored', () => {
    const result = matchDeal(deal, box)
    expect(result.factors).toHaveLength(10)
    for (const factor of result.factors) {
      expect(factor.detail.length).toBeGreaterThan(0)
      expect(factor.score).toBeLessThanOrEqual(factor.weight)
    }
  })

  it('hard-fails and caps the score when the loan is too small', () => {
    const result = matchDeal({ ...deal, loanAmount: 1_000_000 }, box)
    expect(result.hardFail).toBe(true)
    expect(result.band).toBe('outside_box')
    expect(result.score).toBeLessThanOrEqual(45)
  })

  it('hard-fails on an excluded state even when everything else fits', () => {
    const result = matchDeal(deal, { ...box, excludedStates: ['IL'] })
    expect(result.hardFail).toBe(true)
    expect(result.factors.find((f) => f.key === 'geography')?.status).toBe('fail')
  })

  it('hard-fails when the state is outside the stated footprint', () => {
    const result = matchDeal({ ...deal, state: 'CA' }, box)
    expect(result.hardFail).toBe(true)
  })

  it('is case-insensitive about state codes', () => {
    const result = matchDeal({ ...deal, state: 'il' }, box)
    expect(result.hardFail).toBe(false)
  })

  it('hard-fails above the maximum LTV and below the minimum DSCR', () => {
    expect(matchDeal({ ...deal, ltvPct: 85 }, box).hardFail).toBe(true)
    expect(matchDeal({ ...deal, dscr: 1.1 }, box).hardFail).toBe(true)
  })

  it('hard-fails on an excluded asset type', () => {
    const result = matchDeal(deal, { ...box, excludedAssetTypes: ['snf'] })
    expect(result.hardFail).toBe(true)
    expect(result.factors.find((f) => f.key === 'asset_type')?.status).toBe('fail')
  })

  it('treats a soft preference miss as a concern, not a disqualification', () => {
    const result = matchDeal({ ...deal, medicaidPct: 78 }, box)
    expect(result.hardFail).toBe(false)
    expect(result.concerns.some((c) => c.includes('Medicaid'))).toBe(true)
    expect(result.factors.find((f) => f.key === 'payer_mix')?.status).toBe('concern')
  })

  it('scores an unknown metric at half credit and surfaces it as a concern', () => {
    const result = matchDeal({ ...deal, occupancyPct: null }, box)
    const factor = result.factors.find((f) => f.key === 'occupancy')!
    expect(factor.status).toBe('unknown')
    expect(factor.score).toBe(factor.weight * 0.5)
    expect(result.hardFail).toBe(false)
    expect(result.concerns.some((c) => c.includes('occupancy'))).toBe(true)
  })

  it('ranks an incomplete deal below the identical complete deal', () => {
    const complete = matchDeal(deal, box).score
    const incomplete = matchDeal(
      { ...deal, occupancyPct: null, medicaidPct: null, privatePayPct: null },
      box,
    ).score
    expect(incomplete).toBeLessThan(complete)
  })

  it('rewards headroom inside a limit over sitting exactly at it', () => {
    const atLimit = matchDeal({ ...deal, ltvPct: 80 }, box).score
    const conservative = matchDeal({ ...deal, ltvPct: 55 }, box).score
    expect(conservative).toBeGreaterThan(atLimit)
  })

  it('rewards proximity to the lender preferred check size', () => {
    const onSize = matchDeal({ ...deal, loanAmount: 10_000_000 }, box).score
    const offSize = matchDeal({ ...deal, loanAmount: 24_000_000 }, box).score
    expect(onSize).toBeGreaterThan(offSize)
  })

  it('handles an empty lending box without throwing', () => {
    const openBox: MatchableBox = {
      minLoan: null, maxLoan: null, maxLtvPct: null, minDscr: null, minDebtYieldPct: null,
      minOccupancyPct: null, states: [], excludedStates: [], assetTypes: [], excludedAssetTypes: [],
      transactionTypes: [], minOperatorYears: null, minFacilitiesOperated: null,
      maxMedicaidPct: null, minPrivatePayPct: null, preferredDealSize: null,
    }
    const result = matchDeal(deal, openBox)
    expect(result.hardFail).toBe(false)
    expect(result.score).toBeGreaterThan(80)
  })

  it('handles a deal with no data at all without throwing', () => {
    const empty: MatchableDeal = {
      assetType: 'snf', transactionType: 'acquisition', state: '', loanAmount: null,
      ltvPct: null, dscr: null, debtYieldPct: null, occupancyPct: null, medicaidPct: null,
      privatePayPct: null, sponsorYearsExperience: null, sponsorFacilitiesOperated: null,
      daysToClose: null,
    }
    const result = matchDeal(empty, box)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThan(80)
  })
})

describe('bandFor', () => {
  it('maps scores to bands', () => {
    expect(bandFor(92, false)).toBe('strong')
    expect(bandFor(74, false)).toBe('good')
    expect(bandFor(55, false)).toBe('possible')
    expect(bandFor(95, true)).toBe('outside_box')
  })
})

describe('relevanceScore', () => {
  const base = { matchScore: 90, dealQualityScore: 80, daysToClose: 60, lenderResponsiveness: 70 }

  it('blends fit, quality, timeline and responsiveness', () => {
    expect(relevanceScore(base)).toBeGreaterThan(70)
    expect(relevanceScore(base)).toBeLessThanOrEqual(100)
  })

  it('ranks a well-prepared package above a thin one at equal fit', () => {
    expect(relevanceScore({ ...base, dealQualityScore: 95 })).toBeGreaterThan(
      relevanceScore({ ...base, dealQualityScore: 40 }),
    )
  })

  it('favours a nearer closing date', () => {
    expect(relevanceScore({ ...base, daysToClose: 35 })).toBeGreaterThan(
      relevanceScore({ ...base, daysToClose: 300 }),
    )
  })

  it('uses weights that sum to one', () => {
    const total = Object.values(DEFAULT_RANKING_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('never exceeds 100', () => {
    expect(relevanceScore({ matchScore: 100, dealQualityScore: 100, daysToClose: 1, lenderResponsiveness: 100, borrowerPreferenceBoost: 50 })).toBe(100)
  })
})
