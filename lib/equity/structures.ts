import {
  annualDebtServiceInPeriod, dscr, num, round, type Maybe,
} from '@/lib/finance/calculations'
import { project, type ProjectionInput } from '@/lib/equity/projections'

/**
 * Capital structure analysis.
 *
 * Generates the structures a deal's own figures will support and prices each
 * one. Every number is computed; the pros and cons are derived from those
 * numbers by stated rules, not written by a model and not adjectives attached
 * to a preference.
 *
 * No option is called best. A structure that minimises the cost of capital
 * maximises the leverage, and which of those a sponsor wants is a judgement
 * about risk appetite that this module has no basis to make for them.
 */

export interface StructureInput {
  totalCapitalization: number | null
  /** Underwritten net operating income, the source of every coverage figure. */
  noi: number | null
  /** The best rate a lender has actually indicated, or the requested rate. */
  seniorRatePct: number | null
  amortizationMonths: number | null
  interestOnlyMonths: number | null
  /** Cash the sponsor is putting in. Reduces what must be raised from others. */
  sponsorEquity: number | null
  /** Rate a preferred equity layer would carry, as a percentage. */
  preferredRatePct: number | null
  /** Everything the projection engine needs, for the return columns. */
  projection: Omit<ProjectionInput, 'loanAmount' | 'investorEquity' | 'totalEquity'> | null
}

export interface StructureLayer {
  position: 'senior_debt' | 'mezzanine' | 'preferred_equity' | 'common_equity'
  label: string
  amount: number
  sharePct: number
  /** Annual cost of the layer as a fraction, or null when it has no coupon. */
  costPct: number | null
}

export interface StructureOption {
  key: string
  label: string
  description: string
  layers: StructureLayer[]
  totalCapitalization: number
  seniorDebt: number
  leveragePct: number
  annualDebtService: number | null
  dscr: number | null
  equityRequired: number
  sponsorEquity: number
  investorEquity: number
  /** The sponsor's share of the common equity, as a fraction. */
  sponsorShareOfCommon: number | null
  /** Weighted average annual cost of the whole stack, as a fraction. */
  blendedCostOfCapital: number | null
  /** Cash left to the common equity in year one, after debt and preferred. */
  cashToCommon: number | null
  projectedIrrPct: number | null
  projectedMultiple: number | null
  pros: string[]
  cons: string[]
  risks: string[]
  insufficientData: string | null
}

/** Leverage points the analysis considers, as fractions of total capitalisation. */
const LEVERAGE_POINTS = [0.6, 0.65, 0.7, 0.75] as const

/** Below this, most balance-sheet lenders on stabilised skilled nursing decline. */
const COVERAGE_FLOOR = 1.25

/**
 * Produces the candidate structures for a deal.
 *
 * Three shapes at a range of leverage: all-common, a preferred slice, and a
 * larger preferred slice. A candidate whose coverage falls below what lenders
 * accept is still returned — with the failure stated — because knowing a
 * structure does not work is as useful as knowing one does.
 */
export function analyzeStructures(input: StructureInput): StructureOption[] {
  const total = num(input.totalCapitalization)
  if (total === null || total <= 0) return []

  const sponsorEquity = num(input.sponsorEquity) ?? 0
  const preferredRate = num(input.preferredRatePct)

  const candidates: { key: string; label: string; description: string; leverage: number; preferredShare: number }[] = [
    {
      key: 'conservative',
      label: 'Conservative leverage, all common',
      description: 'The least debt of the options considered, with the whole equity as common.',
      leverage: LEVERAGE_POINTS[0], preferredShare: 0,
    },
    {
      key: 'balanced',
      label: 'Moderate leverage, all common',
      description: 'A conventional structure for stabilised skilled nursing.',
      leverage: LEVERAGE_POINTS[2], preferredShare: 0,
    },
    {
      key: 'preferred_slice',
      label: 'Moderate leverage with a preferred slice',
      description: 'Part of the equity raised as preferred, which is cheaper than common but must be paid before it.',
      leverage: LEVERAGE_POINTS[1], preferredShare: 0.35,
    },
    {
      key: 'maximum',
      label: 'Maximum leverage',
      description: 'The most debt of the options considered. Least equity required, least room for error.',
      leverage: LEVERAGE_POINTS[3], preferredShare: 0,
    },
  ]

  return candidates.map((candidate) => {
    const seniorDebt = round(total * candidate.leverage, 2)
    const equityRequired = round(total - seniorDebt, 2)
    const preferredAmount = round(equityRequired * candidate.preferredShare, 2)
    const commonAmount = round(equityRequired - preferredAmount, 2)
    // The sponsor's cash goes into the common layer, which is where the
    // promote is earned and where dilution actually matters.
    const sponsorInCommon = Math.min(sponsorEquity, commonAmount)
    const investorCommon = round(commonAmount - sponsorInCommon, 2)

    const debtService = annualDebtServiceInPeriod(
      seniorDebt, input.seniorRatePct, input.amortizationMonths, input.interestOnlyMonths ?? 0, 1,
    )
    const coverage = dscr(input.noi, debtService)

    const preferredCost = preferredAmount > 0 && preferredRate !== null ? preferredRate / 100 : null
    const debtConstant = debtService !== null && seniorDebt > 0
      ? round(debtService / seniorDebt, 4)
      : null

    const layers: StructureLayer[] = []
    if (seniorDebt > 0) {
      layers.push({
        position: 'senior_debt', label: 'Senior debt', amount: seniorDebt,
        sharePct: round(seniorDebt / total, 4), costPct: debtConstant,
      })
    }
    if (preferredAmount > 0) {
      layers.push({
        position: 'preferred_equity', label: 'Preferred equity', amount: preferredAmount,
        sharePct: round(preferredAmount / total, 4), costPct: preferredCost,
      })
    }
    if (commonAmount > 0) {
      layers.push({
        position: 'common_equity', label: 'Common equity', amount: commonAmount,
        sharePct: round(commonAmount / total, 4), costPct: null,
      })
    }

    // A blended cost is only meaningful when every layer prices. Common equity
    // has no coupon, so the blend here is the cost of the paying layers over
    // the whole stack — stated as such wherever it is shown.
    const pricedLayers = layers.filter((l) => l.costPct !== null)
    const blendedCostOfCapital = pricedLayers.length > 0
      ? round(pricedLayers.reduce((sum, l) => sum + l.amount * (l.costPct ?? 0), 0) / total, 4)
      : null

    const noi = num(input.noi)
    const preferredCharge = preferredAmount > 0 && preferredCost !== null
      ? round(preferredAmount * preferredCost, 2)
      : 0
    const cashToCommon = noi !== null && debtService !== null
      ? round(noi - debtService - preferredCharge, 2)
      : null

    // Returns come from the same projection engine the offering pages use, so
    // a structure's numbers here and on an offering cannot disagree.
    let projectedIrrPct: number | null = null
    let projectedMultiple: number | null = null
    let insufficientData: string | null = null
    if (input.projection && investorCommon > 0) {
      const projection = project({
        ...input.projection,
        loanAmount: seniorDebt,
        investorEquity: investorCommon,
        totalEquity: commonAmount,
      })
      projectedIrrPct = projection.irrPct
      projectedMultiple = projection.equityMultiple
      insufficientData = projection.insufficientData
    } else if (investorCommon <= 0) {
      insufficientData = 'The sponsor’s own contribution covers the common equity, so there is nothing to raise in this structure.'
    }

    const pros: string[] = []
    const cons: string[] = []
    const risks: string[] = []

    if (coverage !== null) {
      if (coverage >= 1.45) pros.push(`Coverage of ${coverage.toFixed(2)}x leaves substantial room before the loan is under strain.`)
      else if (coverage >= COVERAGE_FLOOR) pros.push(`Coverage of ${coverage.toFixed(2)}x clears the level most lenders require.`)
      else cons.push(`Coverage of ${coverage.toFixed(2)}x is below the ${COVERAGE_FLOOR}x most lenders require on stabilised skilled nursing.`)
      if (coverage < COVERAGE_FLOOR) {
        risks.push('A lender is likely to decline this leverage, or to require a larger equity contribution than shown.')
      }
      if (coverage < 1.15) {
        risks.push('At this coverage a single bad quarter puts debt service at risk.')
      }
    }

    if (equityRequired > 0) {
      pros.push(`${formatMoney(equityRequired)} of equity required.`)
    }
    if (candidate.leverage >= 0.75) {
      cons.push('The most leverage of the options considered, so the least cushion if income falls.')
      risks.push('Refinancing risk is greatest here: more debt must be replaced at whatever rates prevail at maturity.')
    }
    if (candidate.leverage <= 0.6) {
      cons.push(`Requires the most equity of the options considered, at ${formatMoney(equityRequired)}.`)
      pros.push('The most cushion against a fall in income or a softer exit.')
    }
    if (preferredAmount > 0) {
      pros.push(`Preferred equity is cheaper than common, reducing the common equity to ${formatMoney(commonAmount)}.`)
      cons.push('Preferred must be paid before common receives anything, so a weak year reaches the common equity first.')
      risks.push('Accrued but unpaid preferred compounds against the common equity where the structure is cumulative.')
    }
    if (sponsorInCommon > 0 && commonAmount > 0) {
      const share = sponsorInCommon / commonAmount
      if (share < 0.05) {
        risks.push(`The sponsor holds ${(share * 100).toFixed(1)}% of the common equity. Investors often expect more alignment than that.`)
      } else {
        pros.push(`The sponsor holds ${(share * 100).toFixed(1)}% of the common equity alongside investors.`)
      }
    }
    if (cashToCommon !== null && cashToCommon <= 0) {
      cons.push('There is no cash left for the common equity after debt service in the first year.')
    }

    return {
      key: candidate.key,
      label: candidate.label,
      description: candidate.description,
      layers,
      totalCapitalization: total,
      seniorDebt,
      leveragePct: round(candidate.leverage, 4),
      annualDebtService: debtService,
      dscr: coverage,
      equityRequired,
      sponsorEquity: sponsorInCommon,
      investorEquity: investorCommon,
      sponsorShareOfCommon: commonAmount > 0 ? round(sponsorInCommon / commonAmount, 4) : null,
      blendedCostOfCapital,
      cashToCommon,
      projectedIrrPct,
      projectedMultiple,
      pros,
      cons,
      risks,
      insufficientData,
    }
  })
}

/**
 * The columns a sponsor compares structures on.
 *
 * Kept beside the analysis so a column can never be added to the table without
 * the value behind it being computed here.
 */
export interface ComparisonRow {
  label: string
  hint?: string
  values: (string | null)[]
  /** True when a lower number is not automatically better, to stop the table implying it. */
  neutral?: boolean
}

export function compareStructures(options: StructureOption[]): ComparisonRow[] {
  const money = (value: Maybe) => {
    const parsed = num(value)
    return parsed === null ? null : formatMoney(parsed)
  }
  const percent = (value: Maybe, digits = 1) => {
    const parsed = num(value)
    return parsed === null ? null : `${(parsed * 100).toFixed(digits)}%`
  }

  return [
    { label: 'Senior debt', values: options.map((o) => money(o.seniorDebt)) },
    { label: 'Leverage', values: options.map((o) => percent(o.leveragePct)) },
    { label: 'Annual debt service', values: options.map((o) => money(o.annualDebtService)) },
    {
      label: 'Debt service coverage',
      hint: `Below ${COVERAGE_FLOOR}x is generally declined`,
      values: options.map((o) => (o.dscr === null ? null : `${o.dscr.toFixed(2)}x`)),
    },
    { label: 'Total equity required', values: options.map((o) => money(o.equityRequired)) },
    { label: 'Sponsor equity', values: options.map((o) => money(o.sponsorEquity)) },
    { label: 'Raised from investors', values: options.map((o) => money(o.investorEquity)) },
    {
      label: 'Sponsor share of common',
      hint: 'Alignment, not dilution of the sponsor',
      values: options.map((o) => percent(o.sponsorShareOfCommon)),
    },
    {
      label: 'Cost of the paying layers',
      hint: 'Debt and preferred only; common equity has no coupon',
      values: options.map((o) => percent(o.blendedCostOfCapital, 2)),
      neutral: true,
    },
    { label: 'Cash to common, year 1', values: options.map((o) => money(o.cashToCommon)) },
    {
      label: 'Projected investor IRR',
      hint: 'Projected from stated assumptions, not a forecast',
      values: options.map((o) => (o.projectedIrrPct === null ? null : `${o.projectedIrrPct.toFixed(1)}%`)),
      neutral: true,
    },
    {
      label: 'Projected equity multiple',
      hint: 'Projected from stated assumptions, not a forecast',
      values: options.map((o) => (o.projectedMultiple === null ? null : `${o.projectedMultiple.toFixed(2)}x`)),
      neutral: true,
    },
  ]
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
