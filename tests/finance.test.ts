import { describe, expect, it } from 'vitest'
import {
  annualDebtService,
  annualDebtServiceInPeriod,
  balloonBalance,
  cagrPct,
  debtYield,
  dscr,
  effectiveRate,
  equityRequirement,
  financingCost,
  growthPct,
  interestOnlyPayment,
  loanToCost,
  ltv,
  ltvOnLesserOf,
  margin,
  maxLoanByDscr,
  monthlyPayment,
  occupancyPct,
  revenuePerPatientDay,
  sourcesAndUses,
  summarize,
  totalInterest,
  underwrittenNoi,
} from '@/lib/finance/calculations'

describe('leverage', () => {
  it('computes LTV as a percentage', () => {
    expect(ltv(10_500_000, 14_000_000)).toBe(75)
  })

  it('sizes LTV to the lesser of appraised value and purchase price', () => {
    // Appraisal below the contract price is the binding constraint.
    expect(ltvOnLesserOf(10_500_000, 13_000_000, 14_000_000)).toBe(80.77)
    expect(ltvOnLesserOf(10_500_000, 15_000_000, 14_000_000)).toBe(75)
  })

  it('returns null rather than guessing when the value basis is missing', () => {
    expect(ltv(10_500_000, null)).toBeNull()
    expect(ltv(10_500_000, 0)).toBeNull()
    expect(ltvOnLesserOf(10_500_000, null, null)).toBeNull()
  })

  it('computes loan-to-cost across all project uses', () => {
    expect(loanToCost(10_500_000, 15_000_000)).toBe(70)
  })

  it('derives the equity requirement net of all debt sources', () => {
    expect(equityRequirement(15_000_000, { loanAmount: 10_500_000, sellerFinancing: 1_000_000 })).toBe(3_500_000)
  })

  it('never reports negative equity', () => {
    expect(equityRequirement(10_000_000, { loanAmount: 12_000_000 })).toBe(0)
  })
})

describe('debt service', () => {
  it('computes the level monthly payment', () => {
    // $10,500,000 at 7.25% over 25 years.
    expect(monthlyPayment(10_500_000, 7.25, 300)).toBeCloseTo(75_894.72, 1)
  })

  it('falls back to straight-line principal at a zero rate', () => {
    expect(monthlyPayment(1_200_000, 0, 120)).toBe(10_000)
  })

  it('computes interest-only payments', () => {
    expect(interestOnlyPayment(10_500_000, 7.25)).toBeCloseTo(63_437.5, 2)
  })

  it('annualises the amortizing constant', () => {
    const monthly = monthlyPayment(10_500_000, 7.25, 300)!
    expect(annualDebtService(10_500_000, 7.25, 300)).toBeCloseTo(monthly * 12, 1)
  })

  it('respects the interest-only period in year-one cash debt service', () => {
    const io = interestOnlyPayment(10_500_000, 7.25)!
    // 24 months of IO means all of year one is interest only.
    expect(annualDebtServiceInPeriod(10_500_000, 7.25, 300, 24, 1)).toBeCloseTo(io * 12, 1)
    // Year three is fully amortizing.
    const amort = monthlyPayment(10_500_000, 7.25, 300)!
    expect(annualDebtServiceInPeriod(10_500_000, 7.25, 300, 24, 3)).toBeCloseTo(amort * 12, 1)
  })

  it('blends the two payment types in the year IO burns off', () => {
    const io = interestOnlyPayment(10_500_000, 7.25)!
    const amort = monthlyPayment(10_500_000, 7.25, 300)!
    // 6 months of IO: half of year one at each payment level.
    expect(annualDebtServiceInPeriod(10_500_000, 7.25, 300, 6, 1)).toBeCloseTo(io * 6 + amort * 6, 1)
  })

  it('computes the balloon balance at maturity', () => {
    const balance = balloonBalance(10_500_000, 7.25, 300, 60)!
    expect(balance).toBeGreaterThan(9_000_000)
    expect(balance).toBeLessThan(10_500_000)
  })

  it('returns the full principal when the loan is interest-only for its whole term', () => {
    expect(balloonBalance(10_500_000, 7.25, 300, 36, 36)).toBe(10_500_000)
  })

  it('amortizes fully to zero when term equals amortization', () => {
    expect(balloonBalance(10_500_000, 7.25, 300, 300)).toBe(0)
  })

  it('reconciles total interest against payments less principal repaid', () => {
    const principal = 10_500_000
    const term = 60
    const monthly = monthlyPayment(principal, 7.25, 300)!
    const balloon = balloonBalance(principal, 7.25, 300, term)!
    const expected = monthly * term - (principal - balloon)
    // Tolerance absorbs the cent-rounding of the displayed monthly payment;
    // the projection itself runs at full precision.
    expect(totalInterest(principal, 7.25, 300, term)).toBeCloseTo(expected, -1)
  })
})

describe('coverage and yield', () => {
  it('computes DSCR', () => {
    expect(dscr(1_500_000, 910_431.72)).toBe(1.65)
  })

  it('computes debt yield as a percentage', () => {
    expect(debtYield(1_270_500, 10_500_000)).toBe(12.1)
  })

  it('refuses to divide by a zero or missing denominator', () => {
    expect(dscr(1_500_000, 0)).toBeNull()
    expect(dscr(null, 900_000)).toBeNull()
    expect(debtYield(1_270_500, 0)).toBeNull()
  })

  it('solves for the maximum loan at a minimum DSCR', () => {
    const max = maxLoanByDscr(1_270_500, 1.45, 7.25, 300)!
    // The solved loan should coverage-test back to exactly the minimum DSCR.
    expect(dscr(1_270_500, annualDebtService(max, 7.25, 300))).toBeCloseTo(1.45, 2)
  })
})

describe('operating metrics', () => {
  it('computes margins and growth', () => {
    expect(margin(2_710_000, 18_400_000)).toBe(14.73)
    expect(growthPct(18_400_000, 17_200_000)).toBe(6.98)
    expect(growthPct(2_400_000, 2_710_000)).toBe(-11.44)
  })

  it('handles a zero prior period without dividing by zero', () => {
    expect(growthPct(100, 0)).toBeNull()
  })

  it('computes CAGR', () => {
    expect(cagrPct(121, 100, 2)).toBeCloseTo(10, 6)
  })

  it('computes occupancy and revenue per patient day', () => {
    expect(occupancyPct(104, 120)).toBe(86.67)
    expect(revenuePerPatientDay(18_400_000, 104)).toBeCloseTo(484.68, 1)
  })

  it('deducts imputed management fee and replacement reserve from EBITDA', () => {
    const result = underwrittenNoi({
      ebitda: 2_710_000,
      revenue: 18_400_000,
      managementFeePct: 5,
      managementFeeCharged: 0,
      replacementReservePerBed: 400,
      beds: 120,
    })
    // 2,710,000 - 920,000 management fee - 48,000 reserve.
    expect(result.value).toBe(1_742_000)
    expect(result.adjustments).toHaveLength(2)
  })

  it('does not double-charge a management fee already in the statements', () => {
    const result = underwrittenNoi({
      ebitda: 2_710_000,
      revenue: 18_400_000,
      managementFeePct: 5,
      managementFeeCharged: 920_000,
    })
    expect(result.value).toBe(2_710_000)
    expect(result.adjustments).toHaveLength(0)
  })

  it('returns null NOI when EBITDA is unknown', () => {
    expect(underwrittenNoi({ ebitda: null, revenue: 18_400_000 }).value).toBeNull()
  })
})

describe('sources and uses', () => {
  it('balances the capital stack with implied equity', () => {
    const result = sourcesAndUses({
      purchasePrice: 14_000_000,
      closingCosts: 420_000,
      capexRequirement: 500_000,
      workingCapitalRequirement: 300_000,
      requestedFinancing: 10_500_000,
      sellerFinancing: 1_000_000,
    })
    expect(result.totalUses).toBe(15_220_000)
    expect(result.impliedEquity).toBe(3_720_000)
    expect(result.totalSources).toBe(15_220_000)
    expect(result.balanced).toBe(true)
  })

  it('flags a stack that does not balance when equity is stated explicitly', () => {
    const result = sourcesAndUses({
      purchasePrice: 14_000_000,
      requestedFinancing: 10_500_000,
      cashEquity: 1_000_000,
    })
    expect(result.balanced).toBe(false)
    expect(result.gap).toBe(-2_500_000)
  })
})

describe('financing cost', () => {
  const terms = {
    loanAmount: 10_500_000,
    allInRatePct: 7.25,
    termMonths: 60,
    amortizationMonths: 300,
    interestOnlyMonths: 12,
    originationFeePct: 1,
    exitFeePct: 0.5,
  }

  it('produces a complete cost profile', () => {
    const cost = financingCost(terms)
    expect(cost.originationFee).toBe(105_000)
    expect(cost.monthlyPaymentInterestOnly).toBeCloseTo(63_437.5, 2)
    expect(cost.balloonBalance).toBeGreaterThan(0)
    expect(cost.totalFees).toBeGreaterThan(cost.originationFee!)
  })

  it('prices fees into the effective rate above the coupon', () => {
    const rate = effectiveRate(terms)!
    expect(rate).toBeGreaterThan(7.25)
    expect(rate).toBeLessThan(9.5)
  })

  it('reduces to the coupon-equivalent annual rate with no fees', () => {
    const noFees = effectiveRate({ ...terms, originationFeePct: 0, exitFeePct: 0 })!
    // 7.25% nominal compounded monthly is 7.4966% effective annual.
    expect(noFees).toBeCloseTo(7.497, 2)
  })

  it('ranks a lower-fee financing as cheaper at an identical coupon', () => {
    const cheap = effectiveRate({ ...terms, originationFeePct: 0.5 })!
    const expensive = effectiveRate({ ...terms, originationFeePct: 2 })!
    expect(cheap).toBeLessThan(expensive)
  })
})

describe('summarize', () => {
  it('reproduces the reference SNF transaction', () => {
    const summary = summarize({
      loanAmount: 10_500_000,
      purchasePrice: 14_000_000,
      appraisedValue: 14_200_000,
      closingCosts: 420_000,
      ratePct: 7.25,
      termMonths: 60,
      amortizationMonths: 300,
      interestOnlyMonths: 12,
      revenue: 18_400_000,
      ebitda: 2_710_000,
      priorRevenue: 17_200_000,
      priorEbitda: 2_450_000,
      beds: 120,
      census: 104,
    })
    expect(summary.ltv).toBe(75)
    expect(summary.dscr).toBeCloseTo(2.98, 1)
    expect(summary.debtYield).toBeCloseTo(25.81, 1)
    expect(summary.ebitdaMargin).toBe(14.73)
    expect(summary.occupancyPct).toBe(86.67)
    expect(summary.revenueGrowthPct).toBe(6.98)
  })

  it('degrades gracefully to nulls when inputs are absent', () => {
    const summary = summarize({})
    expect(summary.ltv).toBeNull()
    expect(summary.dscr).toBeNull()
    expect(summary.debtYield).toBeNull()
    expect(summary.noi).toBeNull()
    expect(summary.sourcesAndUses.totalUses).toBe(0)
  })
})
