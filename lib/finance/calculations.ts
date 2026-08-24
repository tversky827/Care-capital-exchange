/**
 * Deterministic financial calculations.
 *
 * Nothing in this module calls an LLM. Every metric surfaced anywhere in the
 * product — credit memo, marketplace card, offer comparison — resolves to a
 * function here, so a number shown to a lender is always reproducible.
 *
 * Conventions:
 *  - All currency values are USD, expressed as plain numbers (not cents),
 *    because underwriting inputs arrive as dollars from financial statements.
 *  - Percentages are whole numbers (7.25 means 7.25%), matching how rates and
 *    ratios appear on term sheets.
 *  - Any input that is unknown is `null`, and any metric that cannot be
 *    computed from the available inputs returns `null` rather than a guess.
 */

export type Maybe = number | null | undefined

/** Returns the number only when it is finite; otherwise null. */
export function num(value: Maybe): number | null {
  if (value === null || value === undefined) return null
  return Number.isFinite(value) ? value : null
}

/** Rounds to `places` decimals, avoiding accumulated binary float drift. */
export function round(value: number, places = 2): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

// ---------------------------------------------------------------------------
// Leverage
// ---------------------------------------------------------------------------

/**
 * Loan-to-value, as a percentage.
 *
 * Value basis is the appraised value when available and the purchase price
 * otherwise; lenders size to the lesser of the two on an acquisition, so
 * `ltvOnLesserOf` is used where a purchase is involved.
 */
export function ltv(loanAmount: Maybe, value: Maybe): number | null {
  const loan = num(loanAmount)
  const basis = num(value)
  if (loan === null || basis === null || basis <= 0) return null
  return round((loan / basis) * 100, 2)
}

/** LTV against the lesser of appraised value and purchase price. */
export function ltvOnLesserOf(loanAmount: Maybe, appraisedValue: Maybe, purchasePrice: Maybe): number | null {
  const candidates = [num(appraisedValue), num(purchasePrice)].filter((v): v is number => v !== null && v > 0)
  if (!candidates.length) return null
  return ltv(loanAmount, Math.min(...candidates))
}

export interface TotalCostInputs {
  purchasePrice?: Maybe
  closingCosts?: Maybe
  capexRequirement?: Maybe
  workingCapitalRequirement?: Maybe
  existingDebtPayoff?: Maybe
}

/** Total project cost (the denominator of loan-to-cost). */
export function totalCost(inputs: TotalCostInputs): number | null {
  const parts = [
    num(inputs.purchasePrice),
    num(inputs.closingCosts),
    num(inputs.capexRequirement),
    num(inputs.workingCapitalRequirement),
    num(inputs.existingDebtPayoff),
  ]
  if (parts.every((p) => p === null)) return null
  return round(parts.reduce<number>((sum, p) => sum + (p ?? 0), 0), 2)
}

export function loanToCost(loanAmount: Maybe, cost: Maybe): number | null {
  const loan = num(loanAmount)
  const basis = num(cost)
  if (loan === null || basis === null || basis <= 0) return null
  return round((loan / basis) * 100, 2)
}

/** Equity the sponsor must contribute to close: uses less all other sources. */
export function equityRequirement(
  uses: Maybe,
  sources: { loanAmount?: Maybe; sellerFinancing?: Maybe; assumedDebt?: Maybe } = {},
): number | null {
  const total = num(uses)
  if (total === null) return null
  const debt =
    (num(sources.loanAmount) ?? 0) + (num(sources.sellerFinancing) ?? 0) + (num(sources.assumedDebt) ?? 0)
  return round(Math.max(total - debt, 0), 2)
}

// ---------------------------------------------------------------------------
// Debt service
// ---------------------------------------------------------------------------

/**
 * Level monthly payment for a fully amortizing loan.
 *
 * Falls back to straight-line principal when the rate is zero, which keeps the
 * function total instead of dividing by zero.
 */
export function monthlyPayment(
  principal: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
): number | null {
  const payment = rawMonthlyPayment(principal, annualRatePct, amortizationMonths)
  return payment === null ? null : round(payment, 2)
}

/**
 * Unrounded level payment. Multi-period projections (balloon balance, total
 * interest, IRR) use this rather than the to-the-cent figure so that rounding
 * does not compound across 300 periods; only displayed values are rounded.
 */
function rawMonthlyPayment(principal: Maybe, annualRatePct: Maybe, amortizationMonths: Maybe): number | null {
  const p = num(principal)
  const ratePct = num(annualRatePct)
  const n = num(amortizationMonths)
  if (p === null || ratePct === null || n === null) return null
  if (p <= 0 || n <= 0) return null
  const r = ratePct / 100 / 12
  if (r === 0) return p / n
  const payment = (p * r) / (1 - Math.pow(1 + r, -n))
  return Number.isFinite(payment) ? payment : null
}

/** Interest-only monthly payment. */
export function interestOnlyPayment(principal: Maybe, annualRatePct: Maybe): number | null {
  const payment = rawInterestOnlyPayment(principal, annualRatePct)
  return payment === null ? null : round(payment, 2)
}

function rawInterestOnlyPayment(principal: Maybe, annualRatePct: Maybe): number | null {
  const p = num(principal)
  const ratePct = num(annualRatePct)
  if (p === null || ratePct === null) return null
  return (p * (ratePct / 100)) / 12
}

/**
 * Annual debt service on the amortizing constant.
 *
 * Underwriting sizes to the amortizing payment even while a loan is in its
 * interest-only period, because the interest-only relief is temporary. Use
 * `annualDebtServiceInPeriod` when modelling actual year-one cash outflow.
 */
export function annualDebtService(
  principal: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
): number | null {
  const payment = monthlyPayment(principal, annualRatePct, amortizationMonths)
  return payment === null ? null : round(payment * 12, 2)
}

/** Cash debt service in a given loan year, respecting any interest-only period. */
export function annualDebtServiceInPeriod(
  principal: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
  interestOnlyMonths: Maybe,
  loanYear = 1,
): number | null {
  const io = num(interestOnlyMonths) ?? 0
  const startMonth = (loanYear - 1) * 12 + 1
  const endMonth = loanYear * 12
  const ioPayment = interestOnlyPayment(principal, annualRatePct)
  const amortPayment = monthlyPayment(principal, annualRatePct, amortizationMonths)
  if (ioPayment === null) return null
  if (io >= endMonth) return round(ioPayment * 12, 2)
  if (amortPayment === null) return null
  if (io < startMonth) return round(amortPayment * 12, 2)
  const ioMonths = io - startMonth + 1
  return round(ioPayment * ioMonths + amortPayment * (12 - ioMonths), 2)
}

/**
 * Remaining principal after `months` payments on an amortizing loan — the
 * balloon balance at maturity when the amortization term exceeds the loan term.
 */
export function balloonBalance(
  principal: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
  termMonths: Maybe,
  interestOnlyMonths: Maybe = 0,
): number | null {
  const p = num(principal)
  const ratePct = num(annualRatePct)
  const amort = num(amortizationMonths)
  const term = num(termMonths)
  if (p === null || ratePct === null || amort === null || term === null) return null
  const io = Math.min(num(interestOnlyMonths) ?? 0, term)
  const amortizingMonths = Math.max(term - io, 0)
  if (amortizingMonths === 0) return round(p, 2)
  const r = ratePct / 100 / 12
  const payment = rawMonthlyPayment(p, ratePct, amort)
  if (payment === null) return null
  if (r === 0) return round(Math.max(p - payment * amortizingMonths, 0), 2)
  const growth = Math.pow(1 + r, amortizingMonths)
  const balance = p * growth - payment * ((growth - 1) / r)
  return round(Math.max(balance, 0), 2)
}

/** Total interest paid across the loan term, including any balloon repayment. */
export function totalInterest(
  principal: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
  termMonths: Maybe,
  interestOnlyMonths: Maybe = 0,
): number | null {
  const p = num(principal)
  const term = num(termMonths)
  if (p === null || term === null) return null
  const io = Math.min(num(interestOnlyMonths) ?? 0, term)
  const ioPayment = rawInterestOnlyPayment(p, annualRatePct)
  const amortPayment = rawMonthlyPayment(p, annualRatePct, amortizationMonths)
  if (ioPayment === null) return null
  const amortizingMonths = Math.max(term - io, 0)
  if (amortizingMonths > 0 && amortPayment === null) return null
  const balloon = balloonBalance(p, annualRatePct, amortizationMonths, term, io)
  if (balloon === null) return null
  const paid = ioPayment * io + (amortPayment ?? 0) * amortizingMonths
  const principalRepaid = p - balloon
  return round(paid - principalRepaid, 2)
}

// ---------------------------------------------------------------------------
// Coverage & yield
// ---------------------------------------------------------------------------

/**
 * Debt service coverage ratio: cash flow available for debt service divided by
 * annual debt service. Returned to two decimals (1.64x).
 */
export function dscr(netOperatingIncome: Maybe, debtService: Maybe): number | null {
  const noi = num(netOperatingIncome)
  const ds = num(debtService)
  if (noi === null || ds === null || ds <= 0) return null
  return round(noi / ds, 2)
}

/** Debt yield: NOI divided by loan amount, as a percentage. */
export function debtYield(netOperatingIncome: Maybe, loanAmount: Maybe): number | null {
  const noi = num(netOperatingIncome)
  const loan = num(loanAmount)
  if (noi === null || loan === null || loan <= 0) return null
  return round((noi / loan) * 100, 2)
}

/** The largest loan that still clears a minimum DSCR at the given terms. */
export function maxLoanByDscr(
  netOperatingIncome: Maybe,
  minDscr: Maybe,
  annualRatePct: Maybe,
  amortizationMonths: Maybe,
): number | null {
  const noi = num(netOperatingIncome)
  const min = num(minDscr)
  if (noi === null || min === null || min <= 0) return null
  const constant = monthlyPayment(1_000_000, annualRatePct, amortizationMonths)
  if (constant === null || constant <= 0) return null
  const annualConstantPerMillion = constant * 12
  const supportableDebtService = noi / min
  return round((supportableDebtService / annualConstantPerMillion) * 1_000_000, 2)
}

// ---------------------------------------------------------------------------
// Operating metrics
// ---------------------------------------------------------------------------

export function margin(numerator: Maybe, revenue: Maybe): number | null {
  const n = num(numerator)
  const r = num(revenue)
  if (n === null || r === null || r <= 0) return null
  return round((n / r) * 100, 2)
}

/** Period-over-period growth, as a percentage. */
export function growthPct(current: Maybe, prior: Maybe): number | null {
  const c = num(current)
  const p = num(prior)
  if (c === null || p === null || p === 0) return null
  return round(((c - p) / Math.abs(p)) * 100, 2)
}

/** Compound annual growth rate across `years` periods, as a percentage. */
export function cagrPct(endValue: Maybe, startValue: Maybe, years: Maybe): number | null {
  const end = num(endValue)
  const start = num(startValue)
  const y = num(years)
  if (end === null || start === null || y === null) return null
  if (start <= 0 || end <= 0 || y <= 0) return null
  return round((Math.pow(end / start, 1 / y) - 1) * 100, 2)
}

export function occupancyPct(census: Maybe, beds: Maybe): number | null {
  const c = num(census)
  const b = num(beds)
  if (c === null || b === null || b <= 0) return null
  return round((c / b) * 100, 2)
}

/** Revenue per patient day from annual revenue and average census. */
export function revenuePerPatientDay(annualRevenue: Maybe, averageCensus: Maybe, days = 365): number | null {
  const revenue = num(annualRevenue)
  const census = num(averageCensus)
  if (revenue === null || census === null || census <= 0) return null
  return round(revenue / (census * days), 2)
}

/** EBITDAR reconstructed from EBITDA plus rent. */
export function ebitdar(ebitda: Maybe, rent: Maybe): number | null {
  const e = num(ebitda)
  const r = num(rent)
  if (e === null) return null
  return round(e + (r ?? 0), 2)
}

/**
 * Net operating income used for underwriting: EBITDA less a management fee and
 * a replacement reserve, both of which lenders impute whether or not the
 * seller's statements carry them.
 */
export interface UnderwrittenNoiInputs {
  ebitda?: Maybe
  revenue?: Maybe
  managementFeePct?: Maybe
  managementFeeCharged?: Maybe
  replacementReservePerBed?: Maybe
  beds?: Maybe
}

export interface UnderwrittenNoi {
  value: number | null
  adjustments: { label: string; amount: number }[]
}

export function underwrittenNoi(inputs: UnderwrittenNoiInputs): UnderwrittenNoi {
  const ebitdaValue = num(inputs.ebitda)
  if (ebitdaValue === null) return { value: null, adjustments: [] }
  const adjustments: { label: string; amount: number }[] = []
  let value = ebitdaValue

  const revenue = num(inputs.revenue)
  const feePct = num(inputs.managementFeePct)
  if (revenue !== null && feePct !== null && feePct > 0) {
    const imputed = (revenue * feePct) / 100
    const alreadyCharged = num(inputs.managementFeeCharged) ?? 0
    const incremental = Math.max(imputed - alreadyCharged, 0)
    if (incremental > 0) {
      adjustments.push({ label: `Imputed management fee (${feePct}% of revenue)`, amount: -round(incremental, 2) })
      value -= incremental
    }
  }

  const reservePerBed = num(inputs.replacementReservePerBed)
  const beds = num(inputs.beds)
  if (reservePerBed !== null && beds !== null && beds > 0) {
    const reserve = reservePerBed * beds
    adjustments.push({ label: `Replacement reserve ($${reservePerBed}/bed)`, amount: -round(reserve, 2) })
    value -= reserve
  }

  return { value: round(value, 2), adjustments }
}

// ---------------------------------------------------------------------------
// Sources & uses
// ---------------------------------------------------------------------------

export interface SourcesAndUsesInputs {
  purchasePrice?: Maybe
  existingDebtPayoff?: Maybe
  closingCosts?: Maybe
  capexRequirement?: Maybe
  workingCapitalRequirement?: Maybe
  requestedFinancing?: Maybe
  sellerFinancing?: Maybe
  cashEquity?: Maybe
}

export interface SourcesAndUsesLine {
  label: string
  amount: number
  pct: number | null
}

export interface SourcesAndUses {
  sources: SourcesAndUsesLine[]
  uses: SourcesAndUsesLine[]
  totalSources: number
  totalUses: number
  /** Positive when sources exceed uses, negative when the deal is short. */
  gap: number
  balanced: boolean
  /** Equity required to balance the capital stack, if not explicitly provided. */
  impliedEquity: number
}

export function sourcesAndUses(inputs: SourcesAndUsesInputs): SourcesAndUses {
  const useLines: { label: string; amount: number }[] = []
  const push = (list: { label: string; amount: number }[], label: string, value: Maybe) => {
    const amount = num(value)
    if (amount !== null && amount !== 0) list.push({ label, amount: round(amount, 2) })
  }

  push(useLines, 'Purchase price', inputs.purchasePrice)
  push(useLines, 'Existing debt payoff', inputs.existingDebtPayoff)
  push(useLines, 'Capital expenditures', inputs.capexRequirement)
  push(useLines, 'Working capital', inputs.workingCapitalRequirement)
  push(useLines, 'Estimated closing costs', inputs.closingCosts)

  const sourceLines: { label: string; amount: number }[] = []
  push(sourceLines, 'Requested senior financing', inputs.requestedFinancing)
  push(sourceLines, 'Seller financing', inputs.sellerFinancing)

  const totalUses = round(useLines.reduce((s, l) => s + l.amount, 0), 2)
  const nonEquitySources = round(sourceLines.reduce((s, l) => s + l.amount, 0), 2)
  const impliedEquity = round(Math.max(totalUses - nonEquitySources, 0), 2)
  const statedEquity = num(inputs.cashEquity)
  const equity = statedEquity ?? impliedEquity
  if (equity > 0) sourceLines.push({ label: 'Sponsor cash equity', amount: round(equity, 2) })

  const totalSources = round(sourceLines.reduce((s, l) => s + l.amount, 0), 2)
  const withPct = (lines: { label: string; amount: number }[], total: number): SourcesAndUsesLine[] =>
    lines.map((l) => ({ ...l, pct: total > 0 ? round((l.amount / total) * 100, 1) : null }))

  const gap = round(totalSources - totalUses, 2)
  return {
    sources: withPct(sourceLines, totalSources),
    uses: withPct(useLines, totalUses),
    totalSources,
    totalUses,
    gap,
    // A dollar of rounding on a nine-figure stack is not an imbalance.
    balanced: Math.abs(gap) < 1,
    impliedEquity,
  }
}

// ---------------------------------------------------------------------------
// Financing cost comparison
// ---------------------------------------------------------------------------

export interface FinancingTerms {
  loanAmount: Maybe
  allInRatePct: Maybe
  termMonths: Maybe
  amortizationMonths: Maybe
  interestOnlyMonths?: Maybe
  originationFeePct?: Maybe
  exitFeePct?: Maybe
}

export interface FinancingCost {
  monthlyPaymentAmortizing: number | null
  monthlyPaymentInterestOnly: number | null
  yearOneDebtService: number | null
  annualDebtService: number | null
  totalInterest: number | null
  originationFee: number | null
  exitFee: number | null
  totalFees: number | null
  totalCostOfCapital: number | null
  balloonBalance: number | null
  /**
   * Effective annual cost including fees, expressed as a percentage. Computed
   * by solving for the IRR of the actual cash flows, so it accounts for fee
   * timing rather than simply averaging fees over the term.
   */
  effectiveRatePct: number | null
}

export function financingCost(terms: FinancingTerms): FinancingCost {
  const loan = num(terms.loanAmount)
  const rate = num(terms.allInRatePct)
  const term = num(terms.termMonths)
  const amort = num(terms.amortizationMonths)
  const io = num(terms.interestOnlyMonths) ?? 0
  const originationPct = num(terms.originationFeePct) ?? 0
  const exitPct = num(terms.exitFeePct) ?? 0

  const amortizing = monthlyPayment(loan, rate, amort)
  const ioPayment = interestOnlyPayment(loan, rate)
  const yearOne = annualDebtServiceInPeriod(loan, rate, amort, io, 1)
  const annual = annualDebtService(loan, rate, amort)
  const interest = totalInterest(loan, rate, amort, term, io)
  const balloon = balloonBalance(loan, rate, amort, term, io)

  const origination = loan === null ? null : round((loan * originationPct) / 100, 2)
  const exit = balloon === null ? null : round((balloon * exitPct) / 100, 2)
  const fees = origination === null || exit === null ? null : round(origination + exit, 2)
  const total = interest === null || fees === null ? null : round(interest + fees, 2)

  return {
    monthlyPaymentAmortizing: amortizing,
    monthlyPaymentInterestOnly: ioPayment,
    yearOneDebtService: yearOne,
    annualDebtService: annual,
    totalInterest: interest,
    originationFee: origination,
    exitFee: exit,
    totalFees: fees,
    totalCostOfCapital: total,
    balloonBalance: balloon,
    effectiveRatePct: effectiveRate(terms),
  }
}

/** Builds the borrower's actual monthly cash flows for a financing. */
export function cashFlows(terms: FinancingTerms): number[] | null {
  const loan = num(terms.loanAmount)
  const rate = num(terms.allInRatePct)
  const term = num(terms.termMonths)
  const amort = num(terms.amortizationMonths)
  if (loan === null || rate === null || term === null || amort === null || term <= 0) return null
  const io = Math.min(num(terms.interestOnlyMonths) ?? 0, term)
  const originationPct = num(terms.originationFeePct) ?? 0
  const exitPct = num(terms.exitFeePct) ?? 0

  const ioPayment = rawInterestOnlyPayment(loan, rate)
  const amortPayment = rawMonthlyPayment(loan, rate, amort)
  if (ioPayment === null) return null
  if (term > io && amortPayment === null) return null
  const balloon = balloonBalance(loan, rate, amort, term, io)
  if (balloon === null) return null

  // t=0: net proceeds after the origination fee is netted out of funding.
  const flows: number[] = [loan - (loan * originationPct) / 100]
  for (let month = 1; month <= term; month++) {
    let payment = month <= io ? ioPayment : (amortPayment as number)
    if (month === term) payment += balloon + (balloon * exitPct) / 100
    flows.push(-payment)
  }
  return flows
}

/**
 * Effective annual cost of the financing (fee-loaded), as a percentage.
 *
 * Solves for the monthly IRR of `cashFlows` by bisection — robust for the
 * single-sign-change flows a loan produces, and it cannot diverge the way
 * Newton's method can on long interest-only structures.
 */
export function effectiveRate(terms: FinancingTerms): number | null {
  const flows = cashFlows(terms)
  if (!flows || flows.length < 2) return null

  const npv = (monthlyRate: number): number =>
    flows.reduce((sum, flow, t) => sum + flow / Math.pow(1 + monthlyRate, t), 0)

  // NPV increases monotonically in the discount rate here: at r=0 the borrower
  // repays more than they received (NPV < 0), and as r grows the repayments are
  // discounted away toward the positive t=0 proceeds. The IRR is the crossing.
  let low = 0
  let high = 1 // 100% per month is far beyond any real financing.
  if (npv(low) > 0) return null // Costless financing — no meaningful rate.
  if (npv(high) < 0) return null // Cost beyond the search bound.
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2
    if (npv(mid) < 0) low = mid
    else high = mid
  }
  const monthly = (low + high) / 2
  return round((Math.pow(1 + monthly, 12) - 1) * 100, 3)
}

// ---------------------------------------------------------------------------
// Composite underwriting summary
// ---------------------------------------------------------------------------

export interface UnderwritingInputs {
  loanAmount?: Maybe
  purchasePrice?: Maybe
  appraisedValue?: Maybe
  existingDebt?: Maybe
  sellerFinancing?: Maybe
  cashEquity?: Maybe
  closingCosts?: Maybe
  capexRequirement?: Maybe
  workingCapitalRequirement?: Maybe
  ratePct?: Maybe
  termMonths?: Maybe
  amortizationMonths?: Maybe
  interestOnlyMonths?: Maybe
  revenue?: Maybe
  ebitda?: Maybe
  rent?: Maybe
  priorRevenue?: Maybe
  priorEbitda?: Maybe
  beds?: Maybe
  census?: Maybe
  managementFeePct?: Maybe
  managementFeeCharged?: Maybe
  replacementReservePerBed?: Maybe
}

export interface UnderwritingSummary {
  loanAmount: number | null
  valueBasis: number | null
  ltv: number | null
  loanToCost: number | null
  totalCost: number | null
  equityRequirement: number | null
  noi: number | null
  noiAdjustments: { label: string; amount: number }[]
  ebitda: number | null
  ebitdar: number | null
  ebitdaMargin: number | null
  revenueGrowthPct: number | null
  ebitdaGrowthPct: number | null
  annualDebtService: number | null
  yearOneDebtService: number | null
  monthlyPayment: number | null
  dscr: number | null
  dscrYearOne: number | null
  debtYield: number | null
  occupancyPct: number | null
  revenuePerPatientDay: number | null
  balloonBalance: number | null
  sourcesAndUses: SourcesAndUses
}

/** Runs the full deterministic metric set for a deal in one pass. */
export function summarize(inputs: UnderwritingInputs): UnderwritingSummary {
  const noiResult = underwrittenNoi({
    ebitda: inputs.ebitda,
    revenue: inputs.revenue,
    managementFeePct: inputs.managementFeePct,
    managementFeeCharged: inputs.managementFeeCharged,
    replacementReservePerBed: inputs.replacementReservePerBed,
    beds: inputs.beds,
  })

  const valueCandidates = [num(inputs.appraisedValue), num(inputs.purchasePrice)].filter(
    (v): v is number => v !== null && v > 0,
  )
  const valueBasis = valueCandidates.length ? Math.min(...valueCandidates) : null

  const cost = totalCost({
    purchasePrice: inputs.purchasePrice,
    closingCosts: inputs.closingCosts,
    capexRequirement: inputs.capexRequirement,
    workingCapitalRequirement: inputs.workingCapitalRequirement,
  })

  const ads = annualDebtService(inputs.loanAmount, inputs.ratePct, inputs.amortizationMonths)
  const yearOne = annualDebtServiceInPeriod(
    inputs.loanAmount,
    inputs.ratePct,
    inputs.amortizationMonths,
    inputs.interestOnlyMonths,
    1,
  )

  const sAndU = sourcesAndUses({
    purchasePrice: inputs.purchasePrice,
    existingDebtPayoff: inputs.existingDebt,
    closingCosts: inputs.closingCosts,
    capexRequirement: inputs.capexRequirement,
    workingCapitalRequirement: inputs.workingCapitalRequirement,
    requestedFinancing: inputs.loanAmount,
    sellerFinancing: inputs.sellerFinancing,
    cashEquity: inputs.cashEquity,
  })

  return {
    loanAmount: num(inputs.loanAmount),
    valueBasis,
    ltv: ltv(inputs.loanAmount, valueBasis),
    loanToCost: loanToCost(inputs.loanAmount, cost),
    totalCost: cost,
    equityRequirement: equityRequirement(sAndU.totalUses, {
      loanAmount: inputs.loanAmount,
      sellerFinancing: inputs.sellerFinancing,
    }),
    noi: noiResult.value,
    noiAdjustments: noiResult.adjustments,
    ebitda: num(inputs.ebitda),
    ebitdar: ebitdar(inputs.ebitda, inputs.rent),
    ebitdaMargin: margin(inputs.ebitda, inputs.revenue),
    revenueGrowthPct: growthPct(inputs.revenue, inputs.priorRevenue),
    ebitdaGrowthPct: growthPct(inputs.ebitda, inputs.priorEbitda),
    annualDebtService: ads,
    yearOneDebtService: yearOne,
    monthlyPayment: monthlyPayment(inputs.loanAmount, inputs.ratePct, inputs.amortizationMonths),
    dscr: dscr(noiResult.value, ads),
    dscrYearOne: dscr(noiResult.value, yearOne),
    debtYield: debtYield(noiResult.value, inputs.loanAmount),
    occupancyPct: occupancyPct(inputs.census, inputs.beds),
    revenuePerPatientDay: revenuePerPatientDay(inputs.revenue, inputs.census),
    balloonBalance: balloonBalance(
      inputs.loanAmount,
      inputs.ratePct,
      inputs.amortizationMonths,
      inputs.termMonths,
      inputs.interestOnlyMonths,
    ),
    sourcesAndUses: sAndU,
  }
}
