import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canEditCapitalStack, canViewCapitalStack } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { round } from '@/lib/finance/calculations'
import { recordAudit } from '../audit'
import { matchCountsForOffering } from './matching'
import type { Actor } from '@/lib/auth/session'
import { analyzeStructures, compareStructures, type ComparisonRow, type StructureOption } from '@/lib/equity/structures'
import type { CapitalPosition, CapitalSource, CapitalStack } from '@/types/equity'

/**
 * The capital stack.
 *
 * This is where the debt marketplace and the equity marketplace meet. One
 * deal, several sources of capital, one picture of how much is still needed
 * and where it might come from.
 *
 * Every figure here is derived from the deal's own record — the underwritten
 * cost, the indications lenders have actually made, the commitments investors
 * have actually made. Nothing is estimated on the sponsor's behalf.
 */

/**
 * What the capital stack actually sits against, and on what basis.
 *
 * An acquisition capitalises at what it costs to buy: price plus closing
 * costs, capital expenditure and working capital. A refinance or
 * recapitalisation has no purchase price — the stack sits against what the
 * asset is worth, so the appraisal is the basis. Using the acquisition figure
 * for a refinance produces a capitalisation smaller than the loan against it,
 * which is not a small error: every ratio computed from it is then nonsense.
 *
 * Returns null rather than guessing when neither basis is available. A capital
 * structure priced off an invented capitalisation is worse than none.
 */
export interface Capitalization {
  amount: number | null
  basis: 'acquisition_cost' | 'appraised_value' | 'unavailable'
  explanation: string
}

export function capitalizationOf(snapshot: NonNullable<Awaited<ReturnType<typeof buildSnapshot>>>): Capitalization {
  const terms = snapshot.terms
  const loanAmount = snapshot.summary.loanAmount
  const extras = (terms?.estimated_closing_costs ?? 0)
    + (terms?.capex_requirement ?? 0)
    + (terms?.working_capital_requirement ?? 0)

  if (terms?.purchase_price) {
    return {
      amount: snapshot.summary.totalCost,
      basis: 'acquisition_cost',
      explanation: 'Purchase price plus closing costs, capital expenditure and working capital.',
    }
  }

  if (terms?.appraised_value) {
    return {
      amount: round(terms.appraised_value + extras, 2),
      basis: 'appraised_value',
      explanation: 'The appraised value of the asset, plus transaction costs. This deal has no purchase price, so value is the basis rather than cost.',
    }
  }

  // A loan with nothing to measure it against cannot produce a capital stack.
  return {
    amount: null,
    basis: 'unavailable',
    explanation: loanAmount
      ? 'This deal has neither a purchase price nor an appraised value, so there is nothing to size a capital structure against.'
      : 'This deal has not been underwritten far enough to establish a capitalisation.',
  }
}

export interface CapitalRequirement {
  /** What the transaction costs in total, including fees and reserves. */
  totalCost: number | null
  /** Debt the deal is seeking or has been offered. */
  debtRequired: number | null
  /** What is left for equity once the debt is in place. */
  equityRequired: number | null
  /** Debt actually indicated by lenders, at the best terms offered. */
  debtIndicated: number | null
  /** Equity actually committed through published offerings. */
  equityCommitted: number | null
  /** Progress toward a fully capitalised deal, as fractions. */
  debtProgress: number | null
  equityProgress: number | null
  overallProgress: number | null
}

/**
 * What this deal still needs, and how far along it is.
 *
 * Deliberately reads the same records the debt side already maintains, so the
 * capital stack cannot drift from what the deal page says.
 */
export async function capitalRequirement(dealId: string): Promise<CapitalRequirement> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) {
    return {
      totalCost: null, debtRequired: null, equityRequired: null,
      debtIndicated: null, equityCommitted: null,
      debtProgress: null, equityProgress: null, overallProgress: null,
    }
  }

  const capitalization = capitalizationOf(snapshot)
  const totalCost = capitalization.amount
  const debtRequired = snapshot.summary.loanAmount
  // Equity is what the capitalisation does not raise as debt. For a refinance
  // this is the owner's existing equity in the asset rather than new money.
  const equityRequired = totalCost !== null && debtRequired !== null
    ? round(Math.max(0, totalCost - debtRequired), 2)
    : snapshot.summary.equityRequirement

  // The best live indication is what the debt is actually worth today.
  const indications = await store.select('indications', { where: { deal_id: dealId } })
  const live = indications.filter((i) => i.status !== 'withdrawn' && i.status !== 'expired')
  const debtIndicated = live.length > 0
    ? Math.max(...live.map((i) => i.loan_amount))
    : null

  const offerings = await store.select('offerings', { where: { deal_id: dealId } })
  const equityCommitted = offerings.length > 0
    ? offerings.reduce((total, o) => total + o.committed_amount, 0)
    : null

  const debtProgress = debtRequired && debtRequired > 0 && debtIndicated !== null
    ? round(Math.min(1, debtIndicated / debtRequired), 4)
    : null
  const equityProgress = equityRequired && equityRequired > 0 && equityCommitted !== null
    ? round(Math.min(1, equityCommitted / equityRequired), 4)
    : null

  // Overall progress weights each side by the capital it represents, so a deal
  // that is mostly debt is not reported as half funded on an equity signature.
  const overallProgress = totalCost && totalCost > 0
    ? round(Math.min(1, ((debtIndicated ?? 0) + (equityCommitted ?? 0)) / totalCost), 4)
    : null

  return {
    totalCost, debtRequired, equityRequired, debtIndicated, equityCommitted,
    debtProgress, equityProgress, overallProgress,
  }
}

export interface StackView {
  stack: CapitalStack
  sources: CapitalSource[]
  /** Total of the sources, which should equal the stack's capitalisation. */
  total: number
  /** Weighted average cost of the capital in the stack, when every layer prices. */
  costOfCapital: number | null
  /** Set when the layers do not add up to the stated capitalisation. */
  imbalance: number | null
}

export async function stacksForDeal(dealId: string): Promise<StackView[]> {
  const store = await db()
  const stacks = await store.select('capital_stacks', {
    where: { deal_id: dealId }, orderBy: { field: 'version' },
  })
  const views: StackView[] = []
  for (const stack of stacks) {
    const sources = await store.select('capital_sources', {
      where: { capital_stack_id: stack.id }, orderBy: { field: 'sort_order' },
    })
    views.push(viewOf(stack, sources))
  }
  return views
}

function viewOf(stack: CapitalStack, sources: CapitalSource[]): StackView {
  const total = round(sources.reduce((sum, s) => sum + s.amount, 0), 2)
  const priced = sources.filter((s) => s.cost_pct !== null)
  // A blended cost is only meaningful when every layer has a price; a partial
  // average would understate the true cost and look authoritative doing it.
  const costOfCapital = priced.length === sources.length && total > 0
    ? round(sources.reduce((sum, s) => sum + s.amount * (s.cost_pct ?? 0), 0) / total, 4)
    : null
  const imbalance = stack.total_capitalization !== null
    ? round(total - stack.total_capitalization, 2)
    : null
  return { stack, sources, total, costOfCapital, imbalance: imbalance === 0 ? null : imbalance }
}

export async function activeStack(dealId: string): Promise<StackView | null> {
  const store = await db()
  const stack = await store.selectOne('capital_stacks', {
    where: { deal_id: dealId, is_active: true },
  })
  if (!stack) return null
  const sources = await store.select('capital_sources', {
    where: { capital_stack_id: stack.id }, orderBy: { field: 'sort_order' },
  })
  return viewOf(stack, sources)
}

export interface SourceInput {
  position: CapitalPosition
  label: string
  amount: number
  cost_pct?: number | null
  lender_id?: string | null
  offering_id?: string | null
  indication_id?: string | null
  status?: CapitalSource['status']
}

export async function createStack(
  actor: Actor,
  dealId: string,
  label: string,
  sources: SourceInput[],
  options: { activate?: boolean } = {},
): Promise<StackView> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditCapitalStack(subjectOf(actor), deal), 'You cannot change this deal’s capital stack.')

  const existing = await store.select('capital_stacks', { where: { deal_id: dealId } })
  const total = round(sources.reduce((sum, s) => sum + s.amount, 0), 2)

  const stack = await store.insert('capital_stacks', {
    deal_id: dealId,
    version: existing.length + 1,
    label,
    is_active: false,
    total_capitalization: total,
    notes: null,
    created_by: actor.user.id,
  } as Omit<CapitalStack, 'id' | 'created_at' | 'updated_at'>)

  const saved: CapitalSource[] = []
  let order = 0
  for (const source of sources) {
    saved.push(await store.insert('capital_sources', {
      capital_stack_id: stack.id,
      deal_id: dealId,
      position: source.position,
      label: source.label,
      amount: source.amount,
      share_pct: total > 0 ? round(source.amount / total, 4) : null,
      cost_pct: source.cost_pct ?? null,
      lender_id: source.lender_id ?? null,
      offering_id: source.offering_id ?? null,
      indication_id: source.indication_id ?? null,
      status: source.status ?? 'planned',
      sort_order: order++,
    } as Omit<CapitalSource, 'id' | 'created_at' | 'updated_at'>))
  }

  if (options.activate ?? existing.length === 0) {
    await activateStack(actor, dealId, stack.id)
  }

  await recordAudit({
    actor, action: 'capital_stack.created', entityType: 'deal', entityId: dealId, dealId,
    summary: `${actor.user.full_name} created capital structure "${label}".`,
  })
  return viewOf(stack, saved)
}

/** Exactly one structure is the one the deal is pursuing. */
export async function activateStack(actor: Actor, dealId: string, stackId: string): Promise<void> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditCapitalStack(subjectOf(actor), deal), 'You cannot change this deal’s capital stack.')

  const stacks = await store.select('capital_stacks', { where: { deal_id: dealId } })
  for (const stack of stacks) {
    if (stack.is_active !== (stack.id === stackId)) {
      await store.update('capital_stacks', stack.id, { is_active: stack.id === stackId } as Partial<CapitalStack>)
    }
  }
  await recordAudit({
    actor, action: 'capital_stack.activated', entityType: 'deal', entityId: dealId, dealId,
    summary: 'A capital structure was made active for this deal.',
  })
}

/**
 * Builds the structure a deal's own figures imply, as a starting point.
 *
 * Uses the deal's underwritten debt and the gap that remains. It is a draft
 * for the sponsor to edit, not a recommendation, and it is labelled as such
 * wherever it appears.
 */
export async function suggestStack(dealId: string): Promise<SourceInput[]> {
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) return []
  const { loanAmount, equityRequirement } = snapshot.summary
  const sources: SourceInput[] = []

  if (loanAmount !== null && loanAmount > 0) {
    sources.push({
      position: 'senior_debt',
      label: 'Senior debt',
      amount: loanAmount,
      cost_pct: snapshot.assumedTerms.ratePct !== null ? snapshot.assumedTerms.ratePct / 100 : null,
      status: 'planned',
    })
  }
  if (equityRequirement !== null && equityRequirement > 0) {
    sources.push({
      position: 'common_equity',
      label: 'Common equity',
      amount: equityRequirement,
      cost_pct: null,
      status: 'planned',
    })
  }
  return sources
}

/**
 * The unified capital picture: what the debt side has produced, what the
 * equity side has produced, and how far the deal is from being funded.
 */
export interface CapitalMarketsView {
  requirement: CapitalRequirement
  stack: StackView | null
  debt: { lenderMatches: number; indications: number; bestIndication: number | null }
  equity: { offerings: number; investorMatches: number; interested: number; committed: number }
}

export async function capitalMarketsView(actor: Actor, dealId: string): Promise<CapitalMarketsView> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canViewCapitalStack(subjectOf(actor), deal), 'This deal is not available to you.')

  const [requirement, stack, matches, indications, offerings] = await Promise.all([
    capitalRequirement(dealId),
    activeStack(dealId),
    store.select('matches', { where: { deal_id: dealId } }),
    store.select('indications', { where: { deal_id: dealId } }),
    store.select('offerings', { where: { deal_id: dealId } }),
  ])

  const live = indications.filter((i) => i.status !== 'withdrawn' && i.status !== 'expired')
  let investorMatches = 0
  let interested = 0
  for (const offering of offerings) {
    const counts = await matchCountsForOffering(offering.id)
    investorMatches += counts.total
    const interests = await store.select('investment_interests', { where: { offering_id: offering.id } })
    interested += interests.filter((i) => i.stage !== 'withdrawn' && i.stage !== 'declined').length
  }

  return {
    requirement,
    stack,
    debt: {
      lenderMatches: matches.length,
      indications: live.length,
      bestIndication: requirement.debtIndicated,
    },
    equity: {
      offerings: offerings.length,
      investorMatches,
      interested,
      committed: requirement.equityCommitted ?? 0,
    },
  }
}

/**
 * The structures this deal's own figures will support, priced and compared.
 *
 * Reads the deal's underwriting and the best rate a lender has actually
 * indicated, so the options reflect what is on the table rather than what
 * would be nice. Returns an empty list when the deal has not been underwritten
 * far enough to price anything.
 */
export async function structureOptions(
  actor: Actor,
  dealId: string,
): Promise<{ options: StructureOption[]; comparison: ComparisonRow[]; ratePctUsed: number | null; rateSource: string }> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canViewCapitalStack(subjectOf(actor), deal), 'This deal is not available to you.')

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) return { options: [], comparison: [], ratePctUsed: null, rateSource: 'none' }

  // A rate a lender has actually offered is better evidence than the rate the
  // borrower asked for. "Lowest" rather than "best": which rate is best depends
  // on its other terms, and this only compares the number.
  const indications = await store.select('indications', { where: { deal_id: dealId } })
  const live = indications.filter((i) => i.status !== 'withdrawn' && i.status !== 'expired')
  const bestRate = live.length > 0
    ? Math.min(...live.map((i) => i.all_in_rate_pct))
    : null
  const ratePctUsed = bestRate ?? snapshot.assumedTerms.ratePct
  const rateSource = bestRate !== null
    ? 'the lowest rate a lender has indicated'
    : snapshot.assumedTerms.assumed
      ? 'a platform assumption, since no rate has been requested or indicated'
      : 'the rate requested on this deal'

  const offerings = await store.select('offerings', { where: { deal_id: dealId } })
  const preferredOffering = offerings.find((o) => o.status !== 'cancelled')
  const preferredTerms = preferredOffering
    ? await store.selectOne('offering_terms', { where: { offering_id: preferredOffering.id } })
    : null

  const capitalization = capitalizationOf(snapshot)
  // A capitalisation smaller than the debt against it means the basis is wrong,
  // and every ratio derived from it would be meaningless.
  if (capitalization.amount === null
    || (snapshot.summary.loanAmount !== null && capitalization.amount < snapshot.summary.loanAmount)) {
    return { options: [], comparison: [], ratePctUsed: null, rateSource: capitalization.explanation }
  }

  const assumptions = preferredTerms?.assumptions ?? null
  const options = analyzeStructures({
    totalCapitalization: capitalization.amount,
    noi: snapshot.summary.noi,
    seniorRatePct: ratePctUsed,
    amortizationMonths: snapshot.assumedTerms.amortizationMonths,
    interestOnlyMonths: snapshot.terms?.requested_io_months ?? 0,
    // Whatever the borrower has said they are contributing, less what the
    // marketplace has already committed on their behalf.
    sponsorEquity: snapshot.sponsor?.liquidity !== undefined && snapshot.sponsor?.liquidity !== null
      ? Math.min(snapshot.sponsor.liquidity, snapshot.summary.equityRequirement ?? 0) * 0.25
      : null,
    preferredRatePct: preferredTerms?.preferred_return_pct !== null && preferredTerms?.preferred_return_pct !== undefined
      ? preferredTerms.preferred_return_pct * 100
      : 10,
    projection: assumptions
      ? {
        revenue: snapshot.latest?.items.revenue ?? null,
        ebitda: snapshot.latest?.items.ebitda ?? null,
        noi: snapshot.summary.noi,
        ratePct: ratePctUsed,
        amortizationMonths: snapshot.assumedTerms.amortizationMonths,
        interestOnlyMonths: snapshot.terms?.requested_io_months ?? 0,
        purchasePrice: snapshot.terms?.purchase_price ?? null,
        holdYears: assumptions.hold_years,
        revenueGrowthPct: assumptions.revenue_growth_pct,
        expenseGrowthPct: assumptions.expense_growth_pct,
        exitCapRatePct: assumptions.exit_cap_rate_pct,
        exitMultipleOfEbitda: assumptions.exit_multiple_of_ebitda,
        sellingCostsPct: assumptions.selling_costs_pct,
        preferredReturnPct: preferredTerms?.preferred_return_pct ?? null,
      }
      : null,
  })

  return { options, comparison: compareStructures(options), ratePctUsed, rateSource }
}
