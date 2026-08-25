import { describe, expect, it } from 'vitest'
import {
  cashOnCash, equityMultiple, exitValueFromCapRate, exitValueFromMultiple,
  grown, irr, netSaleProceeds, ownershipShare,
} from '@/lib/equity/returns'
import { defaultTiers, runWaterfall, type WaterfallInput } from '@/lib/equity/waterfall'

/**
 * The equity mathematics decides what investors are actually paid, so every
 * expectation here is worked out by hand rather than recorded from the code.
 */

describe('irr', () => {
  it('solves a single-period return', () => {
    // 100 in, 110 out one period later is 10% by inspection.
    expect(irr([{ period: 0, amount: -100 }, { period: 1, amount: 110 }])).toBe(10)
  })

  it('solves a level annuity', () => {
    // 100 in, four payments of 30. The annuity factor at 7.71% is 3.3336,
    // and 30 x 3.3336 = 100.0, so the rate is just under 7.72%.
    const rate = irr([
      { period: 0, amount: -100 },
      { period: 1, amount: 30 }, { period: 2, amount: 30 },
      { period: 3, amount: 30 }, { period: 4, amount: 30 },
    ])
    expect(rate).toBeGreaterThan(7.6)
    expect(rate).toBeLessThan(7.8)
  })

  it('compounds a quarterly rate to an annual one', () => {
    // 2% per quarter compounds to (1.02)^4 - 1 = 8.24% annually.
    const rate = irr([{ period: 0, amount: -100 }, { period: 1, amount: 102 }], 4)
    expect(rate).toBeCloseTo(8.24, 1)
  })

  it('refuses a stream with no sign change rather than inventing a rate', () => {
    expect(irr([{ period: 0, amount: -100 }, { period: 1, amount: -50 }])).toBeNull()
    expect(irr([{ period: 0, amount: 100 }, { period: 1, amount: 50 }])).toBeNull()
    expect(irr([{ period: 0, amount: -100 }])).toBeNull()
  })
})

describe('return measures', () => {
  it('computes an equity multiple', () => {
    expect(equityMultiple(100_000, 175_000)).toBe(1.75)
  })

  it('returns null rather than dividing by nothing', () => {
    expect(equityMultiple(0, 100)).toBeNull()
    expect(equityMultiple(null, 100)).toBeNull()
    expect(cashOnCash(8_000, null)).toBeNull()
    expect(ownershipShare(50_000, 0)).toBeNull()
  })

  it('computes cash on cash and ownership share', () => {
    expect(cashOnCash(8_000, 100_000)).toBe(8)
    expect(ownershipShare(250_000, 7_500_000)).toBeCloseTo(0.033333, 5)
  })

  it('values an exit from a cap rate and from a multiple', () => {
    // 1,000,000 of NOI at an 8% cap is 12,500,000.
    expect(exitValueFromCapRate(1_000_000, 8)).toBe(12_500_000)
    expect(exitValueFromMultiple(2_000_000, 6.5)).toBe(13_000_000)
    // A cap rate of zero is not a valuation.
    expect(exitValueFromCapRate(1_000_000, 0)).toBeNull()
  })

  it('nets sale proceeds after costs and debt', () => {
    // 12,500,000 less 2% costs is 12,250,000; less 7,000,000 of debt is 5,250,000.
    expect(netSaleProceeds(12_500_000, 2, 7_000_000)).toBe(5_250_000)
  })

  it('reports a sale that does not clear the debt rather than flooring at zero', () => {
    expect(netSaleProceeds(6_000_000, 2, 7_000_000)).toBe(-1_120_000)
  })

  it('grows a figure at a compound rate', () => {
    // 1,000,000 at 3% for two years is 1,060,900.
    expect(grown(1_000_000, 3, 2)).toBe(1_060_900)
  })
})

function baseInput(overrides: Partial<WaterfallInput> = {}): WaterfallInput {
  return {
    structure: {
      kind: 'preferred_return_promote',
      cumulative_preferred: true,
      has_catch_up: false,
      catch_up_pct: null,
    },
    tiers: defaultTiers('preferred_return_promote', 0.2),
    contributedCapital: 1_000_000,
    capitalReturnedToDate: 0,
    unpaidPreferredToDate: 0,
    cashAvailable: 100_000,
    periodYears: 1,
    preferredReturnPct: 0.08,
    ...overrides,
  }
}

describe('waterfall', () => {
  it('pays the preferred return first, then returns capital', () => {
    // 8% on 1,000,000 for one year accrues 80,000. Of 100,000 available,
    // 80,000 clears the preferred and the remaining 20,000 returns capital.
    const result = runWaterfall(baseInput())
    expect(result.preferredReturn).toBe(80_000)
    expect(result.returnOfCapital).toBe(20_000)
    expect(result.profitShare).toBe(0)
    expect(result.totalToLimitedPartners).toBe(100_000)
    expect(result.totalToSponsor).toBe(0)
    expect(result.capitalRemaining).toBe(980_000)
    expect(result.undistributed).toBe(0)
  })

  it('carries preferred it could not pay when the structure is cumulative', () => {
    // Only 30,000 available against 80,000 accrued: 50,000 carries forward.
    const result = runWaterfall(baseInput({ cashAvailable: 30_000 }))
    expect(result.preferredReturn).toBe(30_000)
    expect(result.unpaidPreferredCarried).toBe(50_000)
  })

  it('forgets unpaid preferred when the structure is not cumulative', () => {
    const result = runWaterfall(baseInput({
      structure: { kind: 'preferred_return', cumulative_preferred: false, has_catch_up: false, catch_up_pct: null },
      unpaidPreferredToDate: 50_000,
      cashAvailable: 200_000,
    }))
    // The 50,000 arrears is dropped; only this period's 80,000 is owed.
    expect(result.preferredReturn).toBe(80_000)
    expect(result.unpaidPreferredCarried).toBe(0)
  })

  it('splits residual profit with the sponsor once capital is back', () => {
    // Capital already returned, so preferred accrues on nothing and the whole
    // 500,000 is residual: 80/20 gives 400,000 and 100,000.
    const result = runWaterfall(baseInput({
      capitalReturnedToDate: 1_000_000,
      cashAvailable: 500_000,
      periodYears: 0,
    }))
    expect(result.profitShare).toBe(400_000)
    expect(result.totalToSponsor).toBe(100_000)
    expect(result.undistributed).toBe(0)
  })

  it('catches the sponsor up to its promote on profit already paid', () => {
    // 80,000 of preferred is paid, then the catch-up brings the sponsor to 20%
    // of profit: 80,000 x 0.2 / 0.8 = 20,000. The residual 100,000 splits 80/20.
    const result = runWaterfall(baseInput({
      structure: { kind: 'preferred_return_promote', cumulative_preferred: true, has_catch_up: true, catch_up_pct: 0.2 },
      tiers: [
        { sequence: 1, label: 'Preferred', kind: 'preferred_return', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 2, label: 'Catch-up', kind: 'catch_up', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 0, sponsor_share_pct: 0.2 },
        { sequence: 3, label: 'Residual', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 0.8, sponsor_share_pct: 0.2 },
      ],
      capitalReturnedToDate: 1_000_000,
      unpaidPreferredToDate: 80_000,
      cashAvailable: 200_000,
      periodYears: 0,
    }))
    expect(result.totalToSponsor).toBe(40_000)
    expect(result.totalToLimitedPartners).toBe(160_000)
    // The sponsor ends on exactly its 20% promote.
    expect(result.totalToSponsor / (result.totalToSponsor + result.totalToLimitedPartners)).toBeCloseTo(0.2, 6)
  })

  it('withholds a hurdle tier until the multiple is cleared', () => {
    const tiers: WaterfallInput['tiers'] = [
      { sequence: 1, label: 'Return of capital', kind: 'return_of_capital', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
      { sequence: 2, label: 'Above 1.5x', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: 1.5, lp_share_pct: 0.7, sponsor_share_pct: 0.3 },
    ]
    // 1,200,000 against 1,000,000 of capital is only 1.2x, so the tier sleeps
    // and the 200,000 it would have split stays undistributed.
    const result = runWaterfall(baseInput({ tiers, cashAvailable: 1_200_000, preferredReturnPct: null }))
    expect(result.returnOfCapital).toBe(1_000_000)
    expect(result.profitShare).toBe(0)
    expect(result.undistributed).toBe(200_000)
  })

  it('never distributes more than the cash available', () => {
    for (const cash of [0, 1, 50_000, 100_000, 999_999, 5_000_000]) {
      const result = runWaterfall(baseInput({ cashAvailable: cash }))
      const paid = result.totalToLimitedPartners + result.totalToSponsor
      expect(paid).toBeLessThanOrEqual(cash + 0.01)
      expect(paid + result.undistributed).toBeCloseTo(cash, 2)
    }
  })

  it('distributes nothing when there is nothing to distribute', () => {
    const result = runWaterfall(baseInput({ cashAvailable: 0 }))
    expect(result.totalToLimitedPartners).toBe(0)
    expect(result.totalToSponsor).toBe(0)
    expect(result.allocations).toHaveLength(3)
  })

  it('gives an unrecognised structure a pro-rata tier that hides nothing', () => {
    const tiers = defaultTiers('straight_pro_rata')
    expect(tiers).toHaveLength(1)
    const result = runWaterfall(baseInput({ tiers, preferredReturnPct: null, cashAvailable: 250_000 }))
    expect(result.totalToLimitedPartners).toBe(250_000)
    expect(result.undistributed).toBe(0)
  })
})
