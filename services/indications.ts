import 'server-only'
import { db } from '@/db'
import { dealContext, subjectOf } from '@/lib/access'
import { authorize, canEditIndication, canSelectIndication, canSubmitIndication, canViewIndication } from '@/lib/policy'
import { financingCost, type FinancingCost } from '@/lib/finance/calculations'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { dscr } from '@/lib/finance/calculations'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { transitionDeal } from './deals'
import type { Actor } from '@/lib/auth/session'
import type { BorrowerPriority, Indication, IndicationCondition, Lender } from '@/types'

/**
 * Financing indications.
 *
 * The language is deliberate throughout: these are *indications of interest*,
 * not approvals or commitments. An indication only becomes a commitment when a
 * lender explicitly marks it as one, and the UI labels it differently when
 * they do.
 *
 * Updates create a new version rather than mutating in place, so a borrower can
 * see how terms moved during a negotiation.
 */

export interface IndicationInput {
  loan_amount: number
  rate_type: Indication['rate_type']
  index_name?: string | null
  index_rate_pct?: number | null
  spread_pct?: number | null
  all_in_rate_pct: number
  term_months: number
  amortization_months: number
  interest_only_months?: number
  origination_fee_pct?: number
  exit_fee_pct?: number
  prepayment_terms?: string | null
  recourse: Indication['recourse']
  guarantees?: string | null
  covenants?: string | null
  closing_timeline_days?: number | null
  expires_at?: string | null
  additional_terms?: string | null
  is_commitment?: boolean
  conditions?: { label: string; detail?: string | null; kind?: IndicationCondition['kind'] }[]
}

export async function submitIndication(
  actor: Actor,
  dealId: string,
  input: IndicationInput,
): Promise<Indication> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  const context = await dealContext(actor, dealId)
  authorize(
    canSubmitIndication(subjectOf(actor), deal, context),
    'You can only submit an indication on a deal that has been shared with your institution.',
  )
  const lenderId = actor.lender!.id

  validate(input)

  const existing = await store.select('indications', { where: { deal_id: dealId, lender_id: lenderId } })
  const version = existing.length + 1

  // Supersede any prior live indication from this lender.
  for (const prior of existing) {
    if (prior.status === 'submitted' || prior.status === 'updated') {
      await store.update('indications', prior.id, { status: 'withdrawn' })
    }
  }

  const indication = await store.insert('indications', {
    deal_id: dealId,
    lender_id: lenderId,
    submitted_by: actor.user.id,
    version,
    status: version === 1 ? 'submitted' : 'updated',
    loan_amount: input.loan_amount,
    rate_type: input.rate_type,
    index_name: input.index_name ?? null,
    index_rate_pct: input.index_rate_pct ?? null,
    spread_pct: input.spread_pct ?? null,
    all_in_rate_pct: input.all_in_rate_pct,
    term_months: input.term_months,
    amortization_months: input.amortization_months,
    interest_only_months: input.interest_only_months ?? 0,
    origination_fee_pct: input.origination_fee_pct ?? 0,
    exit_fee_pct: input.exit_fee_pct ?? 0,
    prepayment_terms: input.prepayment_terms ?? null,
    recourse: input.recourse,
    guarantees: input.guarantees ?? null,
    covenants: input.covenants ?? null,
    closing_timeline_days: input.closing_timeline_days ?? null,
    expires_at: input.expires_at ?? null,
    additional_terms: input.additional_terms ?? null,
    is_commitment: input.is_commitment ?? false,
  } as Omit<Indication, 'id' | 'created_at' | 'updated_at'>)

  if (input.conditions?.length) {
    await store.insertMany(
      'indication_conditions',
      input.conditions.map((condition) => ({
        indication_id: indication.id,
        deal_id: dealId,
        label: condition.label,
        detail: condition.detail ?? null,
        kind: condition.kind ?? 'condition',
        satisfied: false,
      })) as Omit<IndicationCondition, 'id' | 'created_at'>[],
    )
  }

  // Reflect engagement in the lender's own pipeline.
  const distribution = context.distribution
  if (distribution) {
    await store.update('deal_distributions', distribution.id, {
      status: 'engaged',
      pipeline_stage: 'indication_submitted',
    })
  }

  await recordAudit({
    actor,
    action: version === 1 ? 'indication.submitted' : 'indication.updated',
    entityType: 'indication',
    entityId: indication.id,
    dealId,
    summary: `${actor.lender!.institution_name} submitted a financing indication (version ${version}).`,
    metadata: {
      loanAmount: input.loan_amount,
      rate: input.all_in_rate_pct,
      term: input.term_months,
      isCommitment: input.is_commitment ?? false,
    },
  })

  await notify({
    event: version === 1 ? 'indication.received' : 'indication.updated',
    companyId: deal.company_id,
    dealId,
    title: `Financing indication from ${actor.lender!.institution_name}`,
    body: `$${(input.loan_amount / 1_000_000).toFixed(1)}M at ${input.all_in_rate_pct}% over ${Math.round(input.term_months / 12)} years. This is an indication of interest, not a commitment to lend.`,
    href: `/deals/${dealId}/indications`,
  })

  if (deal.status === 'distributed') {
    await transitionDeal(actor, dealId, 'indications_received', 'First financing indication received.').catch(
      // The borrower's deal status is not this lender's to enforce; a failed
      // transition must not roll back their indication.
      () => undefined,
    )
  }

  return indication
}

function validate(input: IndicationInput): void {
  if (!(input.loan_amount > 0)) throw new Error('Loan amount must be greater than zero.')
  if (!(input.all_in_rate_pct >= 0 && input.all_in_rate_pct < 100)) throw new Error('Enter an all-in rate between 0% and 100%.')
  if (!(input.term_months > 0)) throw new Error('Term must be greater than zero.')
  if (!(input.amortization_months > 0)) throw new Error('Amortization must be greater than zero.')
  if ((input.interest_only_months ?? 0) > input.term_months) {
    throw new Error('The interest-only period cannot exceed the loan term.')
  }
  if (input.amortization_months < input.term_months) {
    throw new Error('Amortization cannot be shorter than the term; use a matching amortization for a fully amortizing loan.')
  }
}

export async function withdrawIndication(actor: Actor, indicationId: string, reason?: string): Promise<void> {
  const store = await db()
  const indication = await store.findById('indications', indicationId)
  if (!indication) throw new Error('Indication not found.')
  authorize(canEditIndication(subjectOf(actor), indication), 'You cannot withdraw this indication.')

  await store.update('indications', indicationId, { status: 'withdrawn' })
  const deal = await store.findById('deals', indication.deal_id)
  await recordAudit({
    actor,
    action: 'indication.withdrawn',
    entityType: 'indication',
    entityId: indicationId,
    dealId: indication.deal_id,
    summary: `${actor.lender?.institution_name ?? actor.company.name} withdrew their indication.`,
    metadata: { reason: reason ?? null },
  })
  if (deal) {
    await notify({
      event: 'indication.updated',
      companyId: deal.company_id,
      dealId: deal.id,
      title: `An indication was withdrawn`,
      body: reason ?? `${actor.lender?.institution_name ?? 'A lender'} withdrew their financing indication.`,
      href: `/deals/${deal.id}/indications`,
    })
  }
}

export async function selectIndication(actor: Actor, indicationId: string, note?: string): Promise<void> {
  const store = await db()
  const indication = await store.findById('indications', indicationId)
  if (!indication) throw new Error('Indication not found.')
  const deal = await store.findById('deals', indication.deal_id)
  if (!deal) throw new Error('Deal not found.')
  authorize(canSelectIndication(subjectOf(actor), deal), 'Only the borrower can select a preferred indication.')

  const siblings = await store.select('indications', { where: { deal_id: deal.id } })
  for (const sibling of siblings) {
    if (sibling.id === indicationId) continue
    if (sibling.status === 'submitted' || sibling.status === 'updated') {
      await store.update('indications', sibling.id, { status: 'declined' })
    }
  }
  await store.update('indications', indicationId, { status: 'selected' })

  const lender = await store.findById('lenders', indication.lender_id)
  if (lender) {
    await notify({
      event: 'indication.selected',
      companyId: lender.company_id,
      dealId: deal.id,
      title: `${deal.name} — your indication was selected`,
      body: note ?? 'The borrower has selected your indication as their preferred financing and the deal is moving to diligence.',
      href: `/lender/deals/${deal.id}`,
    })
    const distribution = await store.selectOne('deal_distributions', {
      where: { deal_id: deal.id, lender_id: lender.id },
    })
    if (distribution) {
      await store.update('deal_distributions', distribution.id, { pipeline_stage: 'diligence' })
    }
  }

  await recordAudit({
    actor,
    action: 'indication.selected',
    entityType: 'indication',
    entityId: indicationId,
    dealId: deal.id,
    summary: `${actor.user.full_name} selected the indication from ${lender?.institution_name ?? 'a lender'} as preferred.`,
    metadata: { loanAmount: indication.loan_amount, rate: indication.all_in_rate_pct, note: note ?? null },
  })

  await transitionDeal(actor, deal.id, 'diligence', 'Preferred indication selected.')
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface IndicationComparison {
  indication: Indication
  lender: Lender
  cost: FinancingCost
  /** DSCR the deal would carry under these specific terms. */
  dscrUnderTerms: number | null
  conditions: IndicationCondition[]
  rank: number
  /** Ranking score under the borrower's stated priority, 0–100. */
  priorityScore: number
}

const PRIORITY_LABELS: Record<BorrowerPriority, string> = {
  lowest_rate: 'lowest financing cost',
  highest_leverage: 'highest proceeds',
  longest_term: 'longest term',
  maximum_io: 'maximum interest-only',
  lowest_fees: 'lowest fees',
  non_recourse: 'non-recourse preference',
  fastest_closing: 'fastest closing',
  most_certainty: 'greatest certainty of close',
}

export function priorityLabel(priority: BorrowerPriority): string {
  return PRIORITY_LABELS[priority]
}

/**
 * Ranks indications against the borrower's stated priority.
 *
 * This is a comparison tool, not advice: it says which offer ranks highest on
 * the dimension the borrower selected, and the UI states exactly that.
 */
export async function compareIndications(dealId: string): Promise<IndicationComparison[]> {
  const store = await db()
  const [deal, snapshot, indications, lenders, conditions] = await Promise.all([
    store.findById('deals', dealId),
    buildSnapshot(dealId),
    store.select('indications', { where: { deal_id: dealId } }),
    store.select('lenders', {}),
    store.select('indication_conditions', { where: { deal_id: dealId } }),
  ])
  if (!deal) return []

  const live = indications.filter((i) => ['submitted', 'updated', 'selected'].includes(i.status))
  const noi = snapshot?.summary.noi ?? null

  const rows = live.map((indication) => {
    const cost = financingCost({
      loanAmount: indication.loan_amount,
      allInRatePct: indication.all_in_rate_pct,
      termMonths: indication.term_months,
      amortizationMonths: indication.amortization_months,
      interestOnlyMonths: indication.interest_only_months,
      originationFeePct: indication.origination_fee_pct,
      exitFeePct: indication.exit_fee_pct,
    })
    return {
      indication,
      lender: lenders.find((l) => l.id === indication.lender_id)!,
      cost,
      dscrUnderTerms: dscr(noi, cost.annualDebtService),
      conditions: conditions.filter((c) => c.indication_id === indication.id),
      rank: 0,
      priorityScore: scoreForPriority(indication, cost, deal.borrower_priority),
    }
  })

  return rows
    .filter((row) => Boolean(row.lender))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function scoreForPriority(indication: Indication, cost: FinancingCost, priority: BorrowerPriority): number {
  switch (priority) {
    case 'lowest_rate':
      // Lower effective cost ranks higher; 5% maps to 100, 15% to 0.
      return clamp(100 - ((cost.effectiveRatePct ?? indication.all_in_rate_pct) - 5) * 10)
    case 'highest_leverage':
      return clamp((indication.loan_amount / 1_000_000) * 4)
    case 'longest_term':
      return clamp((indication.term_months / 120) * 100)
    case 'maximum_io':
      return clamp((indication.interest_only_months / 36) * 100)
    case 'lowest_fees':
      return clamp(100 - (indication.origination_fee_pct + indication.exit_fee_pct) * 25)
    case 'non_recourse':
      return indication.recourse === 'non_recourse' ? 100 : indication.recourse === 'partial_recourse' ? 60 : 20
    case 'fastest_closing':
      return clamp(100 - ((indication.closing_timeline_days ?? 90) - 30) * 1.2)
    case 'most_certainty':
      // Fewer conditions and an explicit commitment mean more certainty.
      return clamp((indication.is_commitment ? 60 : 30) + (indication.expires_at ? 20 : 10) + 20)
    default:
      return 50
  }
}

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)))
}

export async function indicationsForDeal(dealId: string, actor: Actor): Promise<Indication[]> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) return []
  const subject = subjectOf(actor)
  const rows = await store.select('indications', {
    where: { deal_id: dealId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
  return rows.filter((indication) => canViewIndication(subject, indication, deal))
}
