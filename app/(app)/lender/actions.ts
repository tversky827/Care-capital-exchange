'use server'

import { revalidatePath } from 'next/cache'
import { requireActor } from '@/lib/auth/session'
import { dealContext, loadDealForActor, subjectOf } from '@/lib/access'
import { authorize, canSubmitIndication, ForbiddenError } from '@/lib/policy'
import { addLenderNote, deleteSavedSearch, saveSearch, updateLenderProfile, upsertLendingBox } from '@/services/lenders'
import { submitIndication, withdrawIndication } from '@/services/indications'
import { updatePipelineStage } from '@/services/distribution'
import { createDataRequests, openThread } from '@/services/messages'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { AssetType, DocumentType, PipelineStage, TransactionType } from '@/types'

/**
 * Lender server actions.
 *
 * Submitting an indication is re-authorized against a live distribution here,
 * not just at render time — a borrower can revoke access between the page load
 * and the submit.
 */

function fail(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null) return null
  const raw = String(value).replace(/[$,\s%]/g, '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function listOf(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
}

export async function saveLendingBoxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await upsertLendingBox(actor, {
      name: String(formData.get('name') ?? 'Primary lending box'),
      min_loan: numberOrNull(formData.get('min_loan')),
      max_loan: numberOrNull(formData.get('max_loan')),
      max_ltv_pct: numberOrNull(formData.get('max_ltv_pct')),
      min_dscr: numberOrNull(formData.get('min_dscr')),
      min_debt_yield_pct: numberOrNull(formData.get('min_debt_yield_pct')),
      min_occupancy_pct: numberOrNull(formData.get('min_occupancy_pct')),
      states: listOf(formData.get('states')),
      excluded_states: listOf(formData.get('excluded_states')),
      asset_types: formData.getAll('asset_types').map(String) as AssetType[],
      excluded_asset_types: formData.getAll('excluded_asset_types').map(String) as AssetType[],
      transaction_types: formData.getAll('transaction_types').map(String) as TransactionType[],
      min_operator_years: numberOrNull(formData.get('min_operator_years')),
      min_facilities_operated: numberOrNull(formData.get('min_facilities_operated')),
      max_medicaid_pct: numberOrNull(formData.get('max_medicaid_pct')),
      min_private_pay_pct: numberOrNull(formData.get('min_private_pay_pct')),
      preferred_deal_size: numberOrNull(formData.get('preferred_deal_size')),
      typical_rate_low_pct: numberOrNull(formData.get('typical_rate_low_pct')),
      typical_rate_high_pct: numberOrNull(formData.get('typical_rate_high_pct')),
      typical_term_months: numberOrNull(formData.get('typical_term_months')),
      requires_appraisal: formData.get('requires_appraisal') === 'yes',
      requires_environmental: formData.get('requires_environmental') === 'yes',
      required_tax_return_years: numberOrNull(formData.get('required_tax_return_years')) ?? 2,
      notes: String(formData.get('notes') ?? '').trim() || null,
      active: true,
    })
    revalidatePath('/lender', 'layout')
    revalidatePath('/marketplace')
    return { success: 'Lending criteria saved. New matches will use them immediately.' }
  } catch (error) {
    return fail(error)
  }
}

export async function saveLenderProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await updateLenderProfile(actor, {
      institution_name: String(formData.get('institution_name') ?? '').trim(),
      institution_type: formData.get('institution_type') as never,
      description: String(formData.get('description') ?? '').trim() || null,
      contact_name: String(formData.get('contact_name') ?? '').trim() || null,
      contact_email: String(formData.get('contact_email') ?? '').trim() || null,
      contact_phone: String(formData.get('contact_phone') ?? '').trim() || null,
      public_profile_fields: formData.getAll('public_profile_fields').map(String),
    })
    revalidatePath('/lender', 'layout')
    return { success: 'Profile saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function submitIndicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal } = await loadDealForActor(actor, dealId)
    const context = await dealContext(actor, dealId)
    authorize(
      canSubmitIndication(subjectOf(actor), deal, context),
      'You can only submit an indication on a deal that has been shared with your institution.',
    )

    const conditions = String(formData.get('conditions') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => ({ label, kind: 'condition' as const }))

    await submitIndication(actor, dealId, {
      loan_amount: numberOrNull(formData.get('loan_amount')) ?? 0,
      rate_type: (formData.get('rate_type') as 'fixed' | 'floating') ?? 'fixed',
      index_name: String(formData.get('index_name') ?? '').trim() || null,
      index_rate_pct: numberOrNull(formData.get('index_rate_pct')),
      spread_pct: numberOrNull(formData.get('spread_pct')),
      all_in_rate_pct: numberOrNull(formData.get('all_in_rate_pct')) ?? 0,
      term_months: numberOrNull(formData.get('term_months')) ?? 0,
      amortization_months: numberOrNull(formData.get('amortization_months')) ?? 0,
      interest_only_months: numberOrNull(formData.get('interest_only_months')) ?? 0,
      origination_fee_pct: numberOrNull(formData.get('origination_fee_pct')) ?? 0,
      exit_fee_pct: numberOrNull(formData.get('exit_fee_pct')) ?? 0,
      prepayment_terms: String(formData.get('prepayment_terms') ?? '').trim() || null,
      recourse: (formData.get('recourse') as never) ?? 'full_recourse',
      guarantees: String(formData.get('guarantees') ?? '').trim() || null,
      covenants: String(formData.get('covenants') ?? '').trim() || null,
      closing_timeline_days: numberOrNull(formData.get('closing_timeline_days')),
      expires_at: String(formData.get('expires_at') ?? '').trim() || null,
      additional_terms: String(formData.get('additional_terms') ?? '').trim() || null,
      // A commitment is a materially different legal instrument, so it is an
      // explicit opt-in rather than a default.
      is_commitment: formData.get('is_commitment') === 'yes',
      conditions,
    })

    revalidatePath(`/lender/deals/${dealId}`, 'layout')
    revalidatePath('/lender/pipeline')
    return { success: 'Financing indication submitted. The borrower has been notified.' }
  } catch (error) {
    return fail(error)
  }
}

export async function withdrawIndicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await withdrawIndication(actor, String(formData.get('indicationId')), String(formData.get('reason') ?? ''))
    revalidatePath(`/lender/deals/${String(formData.get('dealId'))}`, 'layout')
    return { success: 'Indication withdrawn.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updatePipelineStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await updatePipelineStage(
      actor,
      String(formData.get('distributionId')),
      formData.get('stage') as PipelineStage,
      String(formData.get('reason') ?? '').trim() || undefined,
    )
    revalidatePath('/lender/pipeline')
    revalidatePath('/lender')
    return { success: 'Pipeline updated.' }
  } catch (error) {
    return fail(error)
  }
}

export async function addLenderNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const body = String(formData.get('body') ?? '').trim()
    if (body.length < 2) return { error: 'Write a note before saving.' }
    await addLenderNote(actor, dealId, body)
    revalidatePath(`/lender/deals/${dealId}`, 'layout')
    return { success: 'Note saved. It is visible only inside your institution.' }
  } catch (error) {
    return fail(error)
  }
}

export async function requestInformationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await loadDealForActor(actor, dealId)

    const subject = String(formData.get('subject') ?? '').trim()
    const body = String(formData.get('body') ?? '').trim()
    if (!subject || body.length < 5) return { error: 'Give the request a subject and describe what you need.' }

    await openThread(actor, dealId, subject, body, 'lender_question')

    const docTypes = formData.getAll('docTypes').map(String).filter(Boolean)
    if (docTypes.length) {
      await createDataRequests(
        actor,
        dealId,
        docTypes.map((docType) => ({
          label: docType.replace(/_/g, ' '),
          docType: docType as DocumentType,
          source: 'lender_requirement' as const,
        })),
      )
    }

    revalidatePath(`/lender/deals/${dealId}`, 'layout')
    return { success: 'Request sent to the borrower.' }
  } catch (error) {
    return fail(error)
  }
}

export async function saveSearchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'Give the saved search a name.' }

    await saveSearch(
      actor,
      name,
      {
        states: listOf(formData.get('states')),
        asset_types: formData.getAll('asset_types').map(String) as AssetType[],
        transaction_types: formData.getAll('transaction_types').map(String) as TransactionType[],
        min_loan: numberOrNull(formData.get('min_loan')),
        max_loan: numberOrNull(formData.get('max_loan')),
        max_ltv_pct: numberOrNull(formData.get('max_ltv_pct')),
        min_dscr: numberOrNull(formData.get('min_dscr')),
        min_debt_yield_pct: numberOrNull(formData.get('min_debt_yield_pct')),
        min_occupancy_pct: numberOrNull(formData.get('min_occupancy_pct')),
        max_medicaid_pct: numberOrNull(formData.get('max_medicaid_pct')),
      },
      { alertEnabled: formData.get('alert_enabled') === 'yes' },
    )
    revalidatePath('/marketplace')
    return { success: 'Search saved. You will be alerted when a matching opportunity is posted.' }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteSavedSearchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await deleteSavedSearch(actor, String(formData.get('searchId')))
    revalidatePath('/marketplace')
    return { success: 'Saved search removed.' }
  } catch (error) {
    return fail(error)
  }
}
