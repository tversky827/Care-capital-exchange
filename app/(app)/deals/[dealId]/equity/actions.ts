'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/policy'
import {
  checkOfferingQuality, createOffering, publishOffering, setOfferingStatus, submitForReview,
} from '@/services/equity/offerings'
import { acceptCommitment } from '@/services/equity/commitments'
import { createStack, suggestStack } from '@/services/equity/capital-stack'
import { answerQuestion } from '@/services/equity/portfolio'
import { recomputeMatches } from '@/services/equity/matching'
import { draftUpdate, publishUpdate } from '@/services/equity/updates'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { OfferingType } from '@/types/equity'

/** Sponsor-side equity actions. */

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong.' }
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').replace(/[^0-9.-]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export async function createOfferingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const dealId = String(formData.get('dealId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Give the offering a name.' }

  let offeringId: string
  try {
    const actor = await requireActor()
    const offering = await createOffering(actor, dealId, {
      name,
      offering_type: String(formData.get('offeringType') ?? 'reg_d_506b') as OfferingType,
      legal_structure: String(formData.get('legalStructure') ?? '') || null,
      issuer_entity: String(formData.get('issuerEntity') ?? '') || null,
      summary: String(formData.get('summary') ?? '') || null,
      target_raise: numberOrNull(formData.get('targetRaise')),
      minimum_investment: numberOrNull(formData.get('minimumInvestment')),
      maximum_investment: numberOrNull(formData.get('maximumInvestment')),
      target_close_date: String(formData.get('targetCloseDate') ?? '') || null,
      terms: {
        capital_position: String(formData.get('capitalPosition') ?? 'common_equity') as never,
        target_hold_months: numberOrNull(formData.get('holdYears')) === null
          ? null : (numberOrNull(formData.get('holdYears')) ?? 0) * 12,
        preferred_return_pct: numberOrNull(formData.get('preferredReturn')) === null
          ? null : (numberOrNull(formData.get('preferredReturn')) ?? 0) / 100,
        target_irr_pct: numberOrNull(formData.get('targetIrr')),
        target_equity_multiple: numberOrNull(formData.get('targetMultiple')),
        sponsor_promote_pct: numberOrNull(formData.get('promote')) === null
          ? null : (numberOrNull(formData.get('promote')) ?? 0) / 100,
        distribution_frequency: 'quarterly',
        assumptions: {
          hold_years: numberOrNull(formData.get('holdYears')),
          exit_cap_rate_pct: numberOrNull(formData.get('exitCapRate')),
          exit_multiple_of_ebitda: numberOrNull(formData.get('exitMultiple')),
          revenue_growth_pct: numberOrNull(formData.get('revenueGrowth')),
          expense_growth_pct: numberOrNull(formData.get('expenseGrowth')),
          occupancy_stabilized_pct: numberOrNull(formData.get('stabilizedOccupancy')),
          capex_per_bed: numberOrNull(formData.get('capexPerBed')),
          selling_costs_pct: numberOrNull(formData.get('sellingCosts')),
          notes: String(formData.get('assumptionNotes') ?? '') || null,
        },
      },
      eligibility: {
        accredited_required: formData.get('accreditedRequired') !== 'off',
        verification_required: formData.get('verificationRequired') !== 'off',
      },
    })
    offeringId = offering.id
  } catch (error) {
    return failure(error)
  }
  redirect(`/deals/${dealId}/equity?offering=${offeringId}`)
}

export async function submitForReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  try {
    const actor = await requireActor()
    await submitForReview(actor, offeringId)
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: 'Submitted for compliance review.' }
  } catch (error) {
    return failure(error)
  }
}

export async function publishOfferingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  try {
    const actor = await requireActor()
    await publishOffering(actor, offeringId)
    revalidatePath('/admin/equity')
    revalidatePath(`/investments/${offeringId}`)
    return { success: 'Published to the marketplace.' }
  } catch (error) {
    return failure(error)
  }
}

export async function setStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const status = String(formData.get('status') ?? '')
  try {
    const actor = await requireActor()
    await setOfferingStatus(actor, offeringId, status as never, String(formData.get('reason') ?? 'Changed by the sponsor.'))
    revalidatePath('/admin/equity')
    return { success: `Offering moved to ${status}.` }
  } catch (error) {
    return failure(error)
  }
}

export async function acceptCommitmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const commitmentId = String(formData.get('commitmentId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  try {
    const actor = await requireActor()
    await acceptCommitment(actor, commitmentId)
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: 'Commitment accepted and the investor’s position opened.' }
  } catch (error) {
    return failure(error)
  }
}

export async function answerQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const questionId = String(formData.get('questionId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: 'Write an answer first.' }
  try {
    const actor = await requireActor()
    await answerQuestion(actor, questionId, body)
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: 'Answer sent to the investor.' }
  } catch (error) {
    return failure(error)
  }
}

export async function draftStackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const dealId = String(formData.get('dealId') ?? '')
  try {
    const actor = await requireActor()
    const sources = await suggestStack(dealId)
    if (sources.length === 0) {
      return { error: 'This deal does not yet have the underwriting a capital structure is drawn from.' }
    }
    await createStack(actor, dealId, 'Drafted from underwriting', sources, { activate: true })
    revalidatePath(`/deals/${dealId}/capital`)
    return { success: 'Capital structure drafted.' }
  } catch (error) {
    return failure(error)
  }
}

export async function recomputeMatchesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  try {
    const actor = await requireActor()
    const count = await recomputeMatches(actor, offeringId)
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: `${count} investors scored against this offering.` }
  } catch (error) {
    return failure(error)
  }
}

/** Runs the completeness check without changing anything. */
export async function qualityCheckAction(offeringId: string) {
  await requireActor()
  return checkOfferingQuality(offeringId)
}

export async function draftUpdateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  const periodLabel = String(formData.get('periodLabel') ?? '').trim()
  if (!periodLabel) return { error: 'Name the period this update covers.' }
  try {
    const actor = await requireActor()
    await draftUpdate(actor, offeringId, {
      periodLabel,
      notes: String(formData.get('notes') ?? '') || null,
      metrics: {
        revenue: numberOrNull(formData.get('revenue')),
        ebitda: numberOrNull(formData.get('ebitda')),
        occupancy_pct: numberOrNull(formData.get('occupancy')),
        agency_labor_pct: numberOrNull(formData.get('agencyLabor')),
        debt_balance: numberOrNull(formData.get('debtBalance')),
        capex: numberOrNull(formData.get('capex')),
        distribution_per_100k: numberOrNull(formData.get('distribution')),
      },
    })
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: 'Update drafted. Review it before publishing to investors.' }
  } catch (error) {
    return failure(error)
  }
}

export async function publishUpdateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const updateId = String(formData.get('updateId') ?? '')
  const dealId = String(formData.get('dealId') ?? '')
  try {
    const actor = await requireActor()
    await publishUpdate(actor, updateId)
    revalidatePath(`/deals/${dealId}/equity`)
    return { success: 'Published to the investors in this offering.' }
  } catch (error) {
    return failure(error)
  }
}
