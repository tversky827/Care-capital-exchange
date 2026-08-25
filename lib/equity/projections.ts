import {
  annualDebtServiceInPeriod, balloonBalance, dscr, num, round, type Maybe,
} from '@/lib/finance/calculations'
import {
  equityMultiple, exitValueFromCapRate, exitValueFromMultiple, irr,
  netSaleProceeds, type CashFlow,
} from '@/lib/equity/returns'
import type { ScenarioInputs, ScenarioResults } from '@/types/equity'

/**
 * Deterministic projection of an equity investment.
 *
 * Given a deal's current operating figures, its debt, and the assumptions a
 * sponsor has stated, this produces the year-by-year picture an investor is
 * shown. Nothing is guessed: if an input the arithmetic needs is absent, the
 * projection reports which one and produces no numbers at all.
 *
 * The distinction the product depends on lives here. Everything this module
 * returns is a projection derived from stated assumptions — never a forecast
 * the platform endorses, and never a promise.
 */

export interface ProjectionInput {
  /** Most recent actual figures. */
  revenue: number | null
  ebitda: number | null
  noi: number | null
  /** Debt on the asset at close. */
  loanAmount: number | null
  ratePct: number | null
  amortizationMonths: number | null
  interestOnlyMonths: number | null
  /** Equity raised from investors, and total equity in the deal. */
  investorEquity: number | null
  totalEquity: number | null
  /** Price paid, used for the going-in basis. */
  purchasePrice: number | null
  /** Stated assumptions. */
  holdYears: number | null
  revenueGrowthPct: number | null
  expenseGrowthPct: number | null
  exitCapRatePct: number | null
  exitMultipleOfEbitda: number | null
  sellingCostsPct: number | null
  /** Annual preferred rate as a fraction, for the equity's cash yield. */
  preferredReturnPct: number | null
}

export interface ProjectionYear {
  year: number
  revenue: number | null
  ebitda: number | null
  noi: number | null
  debtService: number | null
  debtBalance: number | null
  dscr: number | null
  /** NOI less debt service: what is available to the equity. */
  cashFlowToEquity: number | null
}

export interface Projection {
  years: ProjectionYear[]
  exitValue: number | null
  exitDebtBalance: number | null
  netSaleProceeds: number | null
  /** Totals over the hold, for the investor's own stake. */
  investorDistributions: number | null
  investorExitProceeds: number | null
  investorTotal: number | null
  irrPct: number | null
  equityMultiple: number | null
  averageCashOnCashPct: number | null
  /** Populated when a required input was missing; the UI shows this instead. */
  insufficientData: string | null
  /** Every assumption used, so the screen can show its own workings. */
  assumptionsUsed: { label: string; value: string }[]
}

const EMPTY: Omit<Projection, 'insufficientData' | 'assumptionsUsed'> = {
  years: [],
  exitValue: null,
  exitDebtBalance: null,
  netSaleProceeds: null,
  investorDistributions: null,
  investorExitProceeds: null,
  investorTotal: null,
  irrPct: null,
  equityMultiple: null,
  averageCashOnCashPct: null,
}

function missing(reason: string): Projection {
  return { ...EMPTY, insufficientData: reason, assumptionsUsed: [] }
}

/**
 * Projects the hold period.
 *
 * The model is deliberately simple and legible: operating income grows at the
 * stated rate, debt amortises on its stated terms, and the asset is sold at
 * the stated exit assumption. A sponsor's real model is more elaborate; this
 * one is auditable line by line, which matters more for a figure an investor
 * is asked to rely on.
 */
export function project(input: ProjectionInput): Projection {
  const holdYears = num(input.holdYears)
  if (holdYears === null || holdYears <= 0) {
    return missing('A hold period is required before returns can be projected.')
  }
  const noi = num(input.noi)
  if (noi === null) {
    return missing('Underwritten net operating income is not available for this deal.')
  }
  const investorEquity = num(input.investorEquity)
  if (investorEquity === null || investorEquity <= 0) {
    return missing('The investor equity amount is not set on this offering.')
  }
  if (input.exitCapRatePct === null && input.exitMultipleOfEbitda === null) {
    return missing('An exit assumption — a capitalisation rate or an EBITDA multiple — has not been stated.')
  }

  const revenueGrowth = num(input.revenueGrowthPct) ?? 0
  const expenseGrowth = num(input.expenseGrowthPct) ?? revenueGrowth
  const loanAmount = num(input.loanAmount)
  const totalEquity = num(input.totalEquity) ?? investorEquity
  const investorShare = totalEquity > 0 ? investorEquity / totalEquity : 0

  const years: ProjectionYear[] = []
  let distributionsToInvestor = 0

  for (let year = 1; year <= Math.floor(holdYears); year++) {
    // NOI grows at the revenue rate net of the expense rate's drag. Modelling
    // the two separately is what lets a downside case pinch margins rather
    // than merely shrinking the top line.
    const growthFactor = Math.pow(1 + revenueGrowth / 100, year)
    const marginDrag = Math.pow((1 + revenueGrowth / 100) / (1 + expenseGrowth / 100), year)
    const yearNoi = round(noi * growthFactor * (expenseGrowth === revenueGrowth ? 1 : marginDrag), 2)
    const yearRevenue = input.revenue !== null ? round(input.revenue * growthFactor, 2) : null
    const yearEbitda = input.ebitda !== null ? round(input.ebitda * growthFactor * (expenseGrowth === revenueGrowth ? 1 : marginDrag), 2) : null

    // Debt service is taken year by year so an interest-only period shows up
    // as the lighter early cash cost it actually is.
    const debtService = annualDebtServiceInPeriod(
      loanAmount, input.ratePct, input.amortizationMonths, input.interestOnlyMonths ?? 0, year,
    )
    const balance = balloonBalance(
      loanAmount, input.ratePct, input.amortizationMonths, year * 12, input.interestOnlyMonths ?? 0,
    )
    const cashFlow = debtService !== null ? round(yearNoi - debtService, 2) : yearNoi
    const toInvestor = round(Math.max(0, cashFlow) * investorShare, 2)
    distributionsToInvestor = round(distributionsToInvestor + toInvestor, 2)

    years.push({
      year,
      revenue: yearRevenue,
      ebitda: yearEbitda,
      noi: yearNoi,
      debtService,
      debtBalance: balance,
      dscr: dscr(yearNoi, debtService),
      cashFlowToEquity: cashFlow,
    })
  }

  const finalYear = years[years.length - 1]
  const exitValue = input.exitCapRatePct !== null
    ? exitValueFromCapRate(finalYear?.noi ?? null, input.exitCapRatePct)
    : exitValueFromMultiple(finalYear?.ebitda ?? null, input.exitMultipleOfEbitda)

  const exitDebtBalance = finalYear?.debtBalance ?? loanAmount ?? 0
  const proceeds = netSaleProceeds(exitValue, input.sellingCostsPct ?? 0, exitDebtBalance)
  const investorExitProceeds = proceeds !== null ? round(proceeds * investorShare, 2) : null

  const flows: CashFlow[] = [{ period: 0, amount: -investorEquity }]
  years.forEach((y) => {
    const toInvestor = y.cashFlowToEquity !== null ? Math.max(0, y.cashFlowToEquity) * investorShare : 0
    const isFinal = y.year === finalYear?.year
    flows.push({
      period: y.year,
      amount: round(toInvestor + (isFinal ? investorExitProceeds ?? 0 : 0), 2),
    })
  })

  const totalToInvestor = round(distributionsToInvestor + (investorExitProceeds ?? 0), 2)
  const averageAnnual = years.length > 0 ? distributionsToInvestor / years.length : 0

  return {
    years,
    exitValue,
    exitDebtBalance,
    netSaleProceeds: proceeds,
    investorDistributions: distributionsToInvestor,
    investorExitProceeds,
    investorTotal: totalToInvestor,
    irrPct: irr(flows),
    equityMultiple: equityMultiple(investorEquity, totalToInvestor),
    averageCashOnCashPct: investorEquity > 0 ? round((averageAnnual / investorEquity) * 100, 2) : null,
    insufficientData: null,
    assumptionsUsed: describeAssumptions(input),
  }
}

function describeAssumptions(input: ProjectionInput): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const add = (label: string, value: Maybe, suffix = '') => {
    const parsed = num(value)
    rows.push({ label, value: parsed === null ? 'Not stated' : `${parsed}${suffix}` })
  }
  add('Hold period', input.holdYears, ' years')
  add('Revenue growth', input.revenueGrowthPct, '% a year')
  add('Expense growth', input.expenseGrowthPct, '% a year')
  if (input.exitCapRatePct !== null) add('Exit capitalisation rate', input.exitCapRatePct, '%')
  else add('Exit EBITDA multiple', input.exitMultipleOfEbitda, 'x')
  add('Selling costs', input.sellingCostsPct, '%')
  add('Interest rate', input.ratePct, '%')
  add('Amortisation', input.amortizationMonths === null ? null : input.amortizationMonths / 12, ' years')
  return rows
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** A scenario with every variable at its base setting. */
export const NEUTRAL_SCENARIO: ScenarioInputs = {
  occupancy_delta_pct: 0,
  revenue_delta_pct: 0,
  labor_delta_pct: 0,
  interest_rate_delta_pct: 0,
  capex_event: 0,
  exit_multiple_delta: 0,
  hold_years_delta: 0,
}

/**
 * The stress applied by each named scenario.
 *
 * These are conventional starting points a user then adjusts, not predictions.
 * The downside cases are deliberately unkind: an investor is better served by
 * a pessimistic case that proves too harsh than an optimistic one that does
 * not.
 */
export const SCENARIO_PRESETS: Record<string, ScenarioInputs> = {
  base: NEUTRAL_SCENARIO,
  upside: {
    ...NEUTRAL_SCENARIO,
    occupancy_delta_pct: 3, revenue_delta_pct: 4, exit_multiple_delta: 0.5,
  },
  downside: {
    ...NEUTRAL_SCENARIO,
    occupancy_delta_pct: -5, revenue_delta_pct: -6, labor_delta_pct: 5,
    interest_rate_delta_pct: 1, exit_multiple_delta: -0.5,
  },
  severe_downside: {
    ...NEUTRAL_SCENARIO,
    occupancy_delta_pct: -10, revenue_delta_pct: -12, labor_delta_pct: 10,
    interest_rate_delta_pct: 2, capex_event: 750_000, exit_multiple_delta: -1.5,
  },
}

/**
 * Applies a scenario's stresses to the projection inputs and re-runs it.
 *
 * The stresses hit the operating line, not the result: occupancy and revenue
 * move NOI, labour moves it the other way, the rate moves debt service, and a
 * capital event takes cash out in year one. Nothing reaches into the returns
 * directly, so the numbers stay consistent with the model above.
 */
export function projectScenario(input: ProjectionInput, scenario: ScenarioInputs): ScenarioResults {
  const stressed: ProjectionInput = {
    ...input,
    // Occupancy and revenue both act on the top line; labour acts against it.
    noi: input.noi === null ? null : round(
      input.noi
        * (1 + scenario.revenue_delta_pct / 100)
        * (1 + scenario.occupancy_delta_pct / 100)
        * (1 - scenario.labor_delta_pct / 100),
      2,
    ),
    revenue: input.revenue === null ? null : round(
      input.revenue * (1 + scenario.revenue_delta_pct / 100) * (1 + scenario.occupancy_delta_pct / 100), 2,
    ),
    ebitda: input.ebitda === null ? null : round(
      input.ebitda
        * (1 + scenario.revenue_delta_pct / 100)
        * (1 + scenario.occupancy_delta_pct / 100)
        * (1 - scenario.labor_delta_pct / 100),
      2,
    ),
    ratePct: input.ratePct === null ? null : round(input.ratePct + scenario.interest_rate_delta_pct, 4),
    exitMultipleOfEbitda: input.exitMultipleOfEbitda === null
      ? null
      : round(input.exitMultipleOfEbitda + scenario.exit_multiple_delta, 3),
    // A lower exit multiple and a higher cap rate are the same pessimism.
    exitCapRatePct: input.exitCapRatePct === null
      ? null
      : round(input.exitCapRatePct - scenario.exit_multiple_delta * 0.25, 4),
    holdYears: input.holdYears === null ? null : input.holdYears + scenario.hold_years_delta,
  }

  const result = project(stressed)
  if (result.insufficientData !== null) {
    return {
      noi: null, debt_service: null, dscr: null, cash_flow_to_equity: null,
      equity_value: null, investor_distributions: null, irr_pct: null,
      equity_multiple: null, insufficient_data: result.insufficientData,
    }
  }

  const firstYear = result.years[0]
  // A one-off capital event comes straight out of the equity's first year.
  const capexDrag = scenario.capex_event > 0 ? scenario.capex_event : 0
  const cashFlow = firstYear?.cashFlowToEquity !== null && firstYear?.cashFlowToEquity !== undefined
    ? round(firstYear.cashFlowToEquity - capexDrag, 2)
    : null

  return {
    noi: firstYear?.noi ?? null,
    debt_service: firstYear?.debtService ?? null,
    dscr: firstYear?.dscr ?? null,
    cash_flow_to_equity: cashFlow,
    equity_value: result.netSaleProceeds,
    investor_distributions: result.investorDistributions,
    irr_pct: result.irrPct,
    equity_multiple: result.equityMultiple,
    insufficient_data: null,
  }
}
