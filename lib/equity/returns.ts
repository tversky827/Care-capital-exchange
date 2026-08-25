import { num, round, type Maybe } from '@/lib/finance/calculations'

/**
 * Equity return mathematics.
 *
 * Every function here is pure, total and tested. No language model computes
 * any of it — the model may describe a result, never produce one.
 *
 * The rule the whole module follows: a missing input yields `null`, never a
 * substituted assumption. A projection built on an invented number is worse
 * than no projection, because it looks equally confident.
 */

/** A dated cash flow. Negative is money in from the investor, positive is out to them. */
export interface CashFlow {
  /** Whole periods from the investment date. Period 0 is the contribution. */
  period: number
  amount: number
}

/**
 * Internal rate of return, per period, solved by bisection.
 *
 * Bisection rather than Newton's method because it cannot diverge: given a
 * sign change it converges every time, which matters more here than speed.
 * Returns null when the flows have no sign change — a stream that only ever
 * loses money, or only ever gains it, has no meaningful rate.
 */
export function irr(flows: CashFlow[], periodsPerYear = 1): number | null {
  if (flows.length < 2) return null
  const hasNegative = flows.some((f) => f.amount < 0)
  const hasPositive = flows.some((f) => f.amount > 0)
  if (!hasNegative || !hasPositive) return null

  const npv = (rate: number): number =>
    flows.reduce((total, f) => total + f.amount / Math.pow(1 + rate, f.period), 0)

  // -99% to +1000% per period brackets anything a real transaction produces.
  let low = -0.99
  let high = 10
  const npvLow = npv(low)
  const npvHigh = npv(high)
  if (Number.isNaN(npvLow) || Number.isNaN(npvHigh)) return null
  if (npvLow * npvHigh > 0) return null

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2
    const value = npv(mid)
    if (npvLow * value <= 0) high = mid
    else low = mid
  }
  const periodic = (low + high) / 2
  // Compound the periodic rate up to an annual one.
  const annual = Math.pow(1 + periodic, periodsPerYear) - 1
  if (!Number.isFinite(annual)) return null
  return round(annual * 100, 2)
}

/**
 * Equity multiple: every dollar distributed for each dollar contributed.
 * Also known as MOIC. Undefined when nothing was contributed.
 */
export function equityMultiple(contributed: Maybe, distributed: Maybe): number | null {
  const invested = num(contributed)
  const returned = num(distributed)
  if (invested === null || returned === null || invested <= 0) return null
  return round(returned / invested, 3)
}

/** Average annual cash yield on contributed capital, as a percentage. */
export function cashOnCash(annualDistribution: Maybe, contributed: Maybe): number | null {
  const distribution = num(annualDistribution)
  const invested = num(contributed)
  if (distribution === null || invested === null || invested <= 0) return null
  return round((distribution / invested) * 100, 2)
}

/**
 * Exit value from a capitalisation rate: stabilised NOI divided by the rate.
 * A zero or negative cap rate is not a valuation, so it yields null.
 */
export function exitValueFromCapRate(noi: Maybe, capRatePct: Maybe): number | null {
  const income = num(noi)
  const rate = num(capRatePct)
  if (income === null || rate === null || rate <= 0) return null
  return round(income / (rate / 100), 2)
}

/** Exit value from an EBITDA multiple. */
export function exitValueFromMultiple(ebitda: Maybe, multiple: Maybe): number | null {
  const earnings = num(ebitda)
  const factor = num(multiple)
  if (earnings === null || factor === null || factor <= 0) return null
  return round(earnings * factor, 2)
}

/**
 * Cash to the equity after a sale: gross price, less selling costs, less the
 * debt that must be repaid. Can legitimately be negative — a sale that does
 * not clear the debt is a real outcome and the model must be able to say so.
 */
export function netSaleProceeds(
  grossValue: Maybe,
  sellingCostsPct: Maybe,
  debtBalance: Maybe,
): number | null {
  const value = num(grossValue)
  if (value === null) return null
  const costsPct = num(sellingCostsPct) ?? 0
  const debt = num(debtBalance) ?? 0
  return round(value * (1 - costsPct / 100) - debt, 2)
}

/** Compounds a base figure forward at an annual growth rate. */
export function grown(base: Maybe, annualGrowthPct: Maybe, years: Maybe): number | null {
  const start = num(base)
  const rate = num(annualGrowthPct)
  const period = num(years)
  if (start === null || rate === null || period === null) return null
  return round(start * Math.pow(1 + rate / 100, period), 2)
}

/**
 * An investor's pro-rata share of an offering, as a fraction.
 * Returns null rather than dividing by a raise nobody has sized.
 */
export function ownershipShare(investment: Maybe, totalEquity: Maybe): number | null {
  const amount = num(investment)
  const total = num(totalEquity)
  if (amount === null || total === null || total <= 0) return null
  return round(amount / total, 6)
}
