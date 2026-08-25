import { round } from '@/lib/finance/calculations'
import type { WaterfallStructure, WaterfallTier } from '@/types/equity'

/**
 * Distribution waterfall.
 *
 * Given the cash a deal has produced and the structure agreed with investors,
 * this decides who is owed what. It is the single most consequential
 * calculation in the equity product — it decides real money — so it is written
 * to be read: explicit tiers, explicit remainders, no cleverness.
 *
 * No language model participates. The AI may explain a distribution after the
 * fact; it never computes one.
 *
 * Conventions:
 *  - Money is in whole currency units and rounded to cents at each boundary.
 *  - Shares are fractions: 0.8 is 80%.
 *  - Preferred return accrues on unreturned capital, and compounds only when
 *    the structure says it is cumulative.
 */

export interface WaterfallInput {
  structure: Pick<WaterfallStructure, 'kind' | 'cumulative_preferred' | 'has_catch_up' | 'catch_up_pct'>
  tiers: Pick<WaterfallTier, 'sequence' | 'label' | 'kind' | 'hurdle_irr_pct' | 'hurdle_multiple' | 'lp_share_pct' | 'sponsor_share_pct'>[]
  /** Capital the limited partners contributed. */
  contributedCapital: number
  /** Capital already returned to them in earlier distributions. */
  capitalReturnedToDate: number
  /** Preferred return earned but not yet paid, carried from earlier periods. */
  unpaidPreferredToDate: number
  /** Cash available to distribute in this event. */
  cashAvailable: number
  /** Length of the period being distributed, in years. A quarter is 0.25. */
  periodYears: number
  /** Annual preferred rate as a fraction. 0.08 is 8%. */
  preferredReturnPct: number | null
}

export interface WaterfallAllocation {
  sequence: number
  label: string
  kind: WaterfallTier['kind']
  toLimitedPartners: number
  toSponsor: number
}

export interface WaterfallResult {
  allocations: WaterfallAllocation[]
  /** Totals across every tier. */
  totalToLimitedPartners: number
  totalToSponsor: number
  /** Split of the limited partners' share, so a statement can explain itself. */
  returnOfCapital: number
  preferredReturn: number
  profitShare: number
  /** Carried into the next period. */
  unpaidPreferredCarried: number
  capitalRemaining: number
  /** Cash that no tier claimed. Non-zero means the structure is incomplete. */
  undistributed: number
}

/**
 * Runs one distribution event through the waterfall.
 *
 * Tiers apply in sequence and each consumes from the remaining cash. A tier
 * that cannot be satisfied in full takes what is left and the rest carries.
 */
export function runWaterfall(input: WaterfallInput): WaterfallResult {
  const {
    structure, contributedCapital, capitalReturnedToDate,
    unpaidPreferredToDate, cashAvailable, periodYears, preferredReturnPct,
  } = input

  let remaining = Math.max(0, round(cashAvailable, 2))
  const capitalRemaining = Math.max(0, round(contributedCapital - capitalReturnedToDate, 2))

  // Preferred accrues on capital still outstanding, for the period's length.
  const accrued = preferredReturnPct !== null && capitalRemaining > 0
    ? round(capitalRemaining * preferredReturnPct * periodYears, 2)
    : 0
  // A non-cumulative structure forgets what it could not pay last period.
  const preferredOwed = structure.cumulative_preferred
    ? round(unpaidPreferredToDate + accrued, 2)
    : accrued

  const allocations: WaterfallAllocation[] = []
  let returnOfCapital = 0
  let preferredReturn = 0
  let profitShare = 0
  let capitalStillOwed = capitalRemaining
  let preferredStillOwed = preferredOwed

  const ordered = [...input.tiers].sort((a, b) => a.sequence - b.sequence)

  for (const tier of ordered) {
    if (remaining <= 0) {
      allocations.push({ sequence: tier.sequence, label: tier.label, kind: tier.kind, toLimitedPartners: 0, toSponsor: 0 })
      continue
    }

    let toLp = 0
    let toSponsor = 0

    switch (tier.kind) {
      case 'preferred_return': {
        toLp = Math.min(remaining, preferredStillOwed)
        preferredStillOwed = round(preferredStillOwed - toLp, 2)
        preferredReturn = round(preferredReturn + toLp, 2)
        break
      }
      case 'return_of_capital': {
        toLp = Math.min(remaining, capitalStillOwed)
        capitalStillOwed = round(capitalStillOwed - toLp, 2)
        returnOfCapital = round(returnOfCapital + toLp, 2)
        break
      }
      case 'catch_up': {
        // The sponsor catches up to its promote on the preferred already paid.
        const catchUpShare = structure.catch_up_pct ?? tier.sponsor_share_pct
        if (!structure.has_catch_up || catchUpShare <= 0 || catchUpShare >= 1) break
        // Target: sponsor holds `catchUpShare` of profit distributed so far.
        const profitSoFar = round(preferredReturn + profitShare, 2)
        const sponsorTarget = round((profitSoFar * catchUpShare) / (1 - catchUpShare), 2)
        toSponsor = Math.max(0, Math.min(remaining, sponsorTarget))
        break
      }
      case 'split': {
        // A hurdle tier only applies once the limited partners have cleared it.
        if (tier.hurdle_multiple !== null && contributedCapital > 0) {
          const distributedToLp = round(returnOfCapital + preferredReturn + profitShare, 2)
          const multipleSoFar = distributedToLp / contributedCapital
          if (multipleSoFar < tier.hurdle_multiple) break
        }
        toLp = round(remaining * tier.lp_share_pct, 2)
        toSponsor = round(remaining * tier.sponsor_share_pct, 2)
        profitShare = round(profitShare + toLp, 2)
        break
      }
    }

    toLp = round(Math.min(toLp, remaining), 2)
    toSponsor = round(Math.min(toSponsor, Math.max(0, remaining - toLp)), 2)
    remaining = round(remaining - toLp - toSponsor, 2)
    allocations.push({ sequence: tier.sequence, label: tier.label, kind: tier.kind, toLimitedPartners: toLp, toSponsor })
  }

  const totalToLimitedPartners = round(allocations.reduce((t, a) => t + a.toLimitedPartners, 0), 2)
  const totalToSponsor = round(allocations.reduce((t, a) => t + a.toSponsor, 0), 2)

  return {
    allocations,
    totalToLimitedPartners,
    totalToSponsor,
    returnOfCapital,
    preferredReturn,
    profitShare,
    unpaidPreferredCarried: Math.max(0, preferredStillOwed),
    capitalRemaining: Math.max(0, capitalStillOwed),
    undistributed: Math.max(0, remaining),
  }
}

/**
 * The tiers a named structure implies.
 *
 * These are conventional defaults a sponsor edits, not rules the platform
 * imposes. A structure the platform does not recognise gets pro-rata, which
 * distributes everything and hides nothing.
 */
export function defaultTiers(
  kind: WaterfallStructure['kind'],
  promotePct = 0.2,
): WaterfallInput['tiers'] {
  const straight: WaterfallInput['tiers'] = [
    { sequence: 1, label: 'Pro rata to all capital', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
  ]

  switch (kind) {
    case 'straight_pro_rata':
      return straight
    case 'preferred_return':
      return [
        { sequence: 1, label: 'Preferred return', kind: 'preferred_return', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 2, label: 'Return of capital', kind: 'return_of_capital', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 3, label: 'Residual, pro rata', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
      ]
    case 'preferred_return_promote':
      return [
        { sequence: 1, label: 'Preferred return', kind: 'preferred_return', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 2, label: 'Return of capital', kind: 'return_of_capital', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 3, label: `Residual split, ${round(promotePct * 100, 0)}% promote`, kind: 'split', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: round(1 - promotePct, 4), sponsor_share_pct: round(promotePct, 4) },
      ]
    case 'hurdle':
    case 'multiple_hurdles':
      return [
        { sequence: 1, label: 'Preferred return', kind: 'preferred_return', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 2, label: 'Return of capital', kind: 'return_of_capital', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0 },
        { sequence: 3, label: 'Residual to 1.5x', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: null, lp_share_pct: 0.8, sponsor_share_pct: 0.2 },
        { sequence: 4, label: 'Above 1.5x', kind: 'split', hurdle_irr_pct: null, hurdle_multiple: 1.5, lp_share_pct: 0.7, sponsor_share_pct: 0.3 },
      ]
    default:
      return straight
  }
}
