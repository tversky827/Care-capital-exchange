import { describe, expect, it } from 'vitest'
import {
  cashOnCash, equityMultiple, exitValueFromCapRate, exitValueFromMultiple,
  grown, irr, netSaleProceeds, ownershipShare,
} from '@/lib/equity/returns'
import { dealEquity, project, type ProjectionInput } from '@/lib/equity/projections'
import { defaultTiers, runWaterfall, type WaterfallInput } from '@/lib/equity/waterfall'
import { analyzeStructures, compareStructures } from '@/lib/equity/structures'
import {
  closingSoonEmail, commitmentStatusEmail, distributionEmail, newMatchEmail, offeringOpenEmail,
  quarterlyUpdateEmail, taxDocumentEmail, verificationRequiredEmail,
} from '@/services/equity/emails'

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

describe('capital structures', () => {
  const base = {
    totalCapitalization: 20_000_000,
    noi: 1_800_000,
    seniorRatePct: 7.25,
    amortizationMonths: 300,
    interestOnlyMonths: 0,
    sponsorEquity: 1_000_000,
    preferredRatePct: 10,
    projection: null,
  }

  it('sizes each layer against total capitalisation', () => {
    const options = analyzeStructures(base)
    expect(options).toHaveLength(4)
    for (const option of options) {
      const total = option.layers.reduce((sum, layer) => sum + layer.amount, 0)
      // The layers must account for the whole capitalisation exactly.
      expect(total).toBeCloseTo(20_000_000, 2)
      expect(option.seniorDebt + option.equityRequired).toBeCloseTo(20_000_000, 2)
    }
  })

  it('states the coverage failure rather than hiding the option', () => {
    // A thin NOI cannot cover high leverage; the option is still returned.
    const options = analyzeStructures({ ...base, noi: 900_000 })
    const maximum = options.find((o) => o.key === 'maximum')!
    expect(maximum.dscr).not.toBeNull()
    expect(maximum.dscr!).toBeLessThan(1.25)
    expect(maximum.cons.join(' ')).toMatch(/below the 1.25x/)
    expect(maximum.risks.join(' ')).toMatch(/decline this leverage/)
  })

  it('prices the preferred slice and warns what it costs the common', () => {
    const option = analyzeStructures(base).find((o) => o.key === 'preferred_slice')!
    const preferred = option.layers.find((l) => l.position === 'preferred_equity')!
    expect(preferred.costPct).toBeCloseTo(0.1, 4)
    expect(option.cons.join(' ')).toMatch(/paid before common/)
    expect(option.risks.join(' ')).toMatch(/compounds against the common/)
  })

  it('never calls an option best', () => {
    const options = analyzeStructures(base)
    const text = JSON.stringify(options).toLowerCase()
    expect(text).not.toMatch(/\bbest\b|\brecommended\b|\bshould choose\b|\boptimal\b/)
  })

  it('reports a structure with nothing left to raise instead of projecting one', () => {
    // The sponsor's own cash covers the whole common equity.
    const options = analyzeStructures({ ...base, sponsorEquity: 20_000_000 })
    for (const option of options) {
      expect(option.investorEquity).toBe(0)
      expect(option.insufficientData).toMatch(/nothing to raise/)
    }
  })

  it('returns nothing rather than guessing when capitalisation is unknown', () => {
    expect(analyzeStructures({ ...base, totalCapitalization: null })).toEqual([])
    expect(analyzeStructures({ ...base, totalCapitalization: 0 })).toEqual([])
  })

  it('builds a comparison whose columns line up with the options', () => {
    const options = analyzeStructures(base)
    const rows = compareStructures(options)
    expect(rows.length).toBeGreaterThan(8)
    for (const row of rows) expect(row.values).toHaveLength(options.length)
    // The return rows are marked neutral so the table cannot imply more is better.
    expect(rows.find((r) => r.label === 'Projected investor IRR')?.neutral).toBe(true)
  })
})

describe('investor email templates', () => {
  const context = {
    investorName: 'Michael Demo',
    offeringName: 'Lakeview Skilled Nursing Equity',
    href: 'https://example.test/investments/abc',
  }

  it('never promises a return or an approval', () => {
    const messages = [
      newMatchEmail('a@b.test', { ...context, reasons: ['You look for skilled nursing assets.'] }),
      offeringOpenEmail('a@b.test', context),
      closingSoonEmail('a@b.test', { ...context, closesOn: '14 March' }),
      commitmentStatusEmail('a@b.test', { ...context, status: 'accepted', amount: '$150,000' }),
      quarterlyUpdateEmail('a@b.test', { ...context, period: 'Q2 2027', highlights: ['Revenue was $3.9M.'] }),
      distributionEmail('a@b.test', { ...context, amount: '$2,750', period: 'Q2 2027' }),
      taxDocumentEmail('a@b.test', { ...context, form: 'Schedule K-1', taxYear: 2026 }),
      verificationRequiredEmail('a@b.test', { investorName: 'Michael Demo', whatIsNeeded: 'Accreditation is outstanding.', href: context.href }),
    ]
    for (const message of messages) {
      expect(message.body).not.toMatch(/guaranteed|risk-free|safe investment|approved investment|expected return/i)
      // Every message carries the standing disclosure.
      expect(message.body).toMatch(/not a broker-dealer/)
      expect(message.subject.length).toBeGreaterThan(5)
      expect(message.subject.length).toBeLessThan(120)
    }
  })

  it('says a match is a match, not a recommendation', () => {
    const message = newMatchEmail('a@b.test', { ...context, reasons: ['You look for skilled nursing.'] })
    expect(message.body).toMatch(/not a recommendation to invest/)
  })

  it('does not describe a commitment as a purchase of securities', () => {
    const message = commitmentStatusEmail('a@b.test', { ...context, status: 'accepted', amount: '$150,000' })
    expect(message.body).toMatch(/not itself a purchase of securities/)
  })
})

describe('the equity a stake is a share of', () => {
  // Cash to close is not total equity, and the difference is what decides an
  // investor's ownership percentage — so every case is checked by hand.
  it('is the value above the debt when that exceeds the raise', () => {
    expect(dealEquity(17_720_000, 10_500_000, 3_500_000)).toBe(7_220_000)
  })

  it('never falls below the equity being raised into the deal', () => {
    // A lightly-capitalised purchase: value less debt is $479,000, which is a
    // quarter of the raise. Dividing the raise by it would hand the investor
    // 417% of every dollar the deal produced.
    expect(dealEquity(9_779_000, 9_300_000, 2_000_000)).toBe(2_000_000)
  })

  it('holds on a cash-out refinance, where the debt exceeds the value', () => {
    expect(dealEquity(23_841_000, 24_700_000, 2_400_000)).toBe(2_400_000)
  })

  it('falls back to the raise when the basis or the debt is unknown', () => {
    expect(dealEquity(null, 9_300_000, 2_000_000)).toBe(2_000_000)
    expect(dealEquity(9_779_000, null, 2_000_000)).toBe(2_000_000)
  })

  it('keeps an investor from being projected more than the deal earns', () => {
    // The full projection, run on the shape that produced the 105% return: the
    // investor's share of the deal cannot exceed the whole of it.
    const base: ProjectionInput = {
      revenue: 12_400_000,
      ebitda: 1_500_000,
      noi: 1_208_459,
      loanAmount: 9_300_000,
      ratePct: 6.9,
      amortizationMonths: 300,
      interestOnlyMonths: 0,
      investorEquity: 2_000_000,
      totalEquity: dealEquity(9_779_000, 9_300_000, 2_000_000),
      purchasePrice: 9_400_000,
      holdYears: 5,
      revenueGrowthPct: 3,
      expenseGrowthPct: 3,
      exitCapRatePct: 12.5,
      exitMultipleOfEbitda: null,
      sellingCostsPct: 2,
      preferredReturnPct: 0.08,
    }
    const projection = project(base)
    expect(projection.insufficientData).toBeNull()
    // A share of one deal, priced off one exit: a multiple in the low single
    // digits over five years. 13.87x was the arithmetic reporting an ownership
    // stake of 417%.
    expect(projection.equityMultiple!).toBeLessThan(5)
    expect(projection.irrPct!).toBeLessThan(60)
    expect(projection.investorExitProceeds!).toBeLessThanOrEqual(projection.netSaleProceeds!)
  })
})
