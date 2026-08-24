'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { loadDealForActor } from '@/lib/access'
import { authorize, canDistributeDeal, canEditDeal, ForbiddenError } from '@/lib/policy'
import {
  approveLineItem, createDeal, transitionDeal, updateFacility, updateSponsor, updateTerms,
} from '@/services/deals'
import { softDeleteDocument, updateDocument, uploadDocument, MAX_UPLOAD_BYTES } from '@/services/documents'
import { resolveDiscrepancy, runReconciliation } from '@/services/discrepancies'
import { runUnderwriting } from '@/services/underwriting'
import { generateCreditMemo, saveMemoEdit } from '@/services/memo'
import { computeMatches } from '@/services/matching'
import { distributeDeal, revokeDistribution } from '@/services/distribution'
import { selectIndication } from '@/services/indications'
import { createDataRequests, openThread, postMessage } from '@/services/messages'
import { askDeal } from '@/services/chat'
import { enqueue } from '@/services/jobs'
import type {
  AssetType, BorrowerPriority, DealStatus, DistributionScope, DocumentType, MemoSection, TransactionType,
} from '@/types'

/**
 * Deal server actions.
 *
 * Every action re-resolves the actor and re-checks authorization: a form
 * rendered by an authorized page is not proof that the submission is
 * authorized, because the form is client-controlled and the deal's state may
 * have changed since it rendered.
 */

export interface ActionState {
  error?: string
  success?: string
}

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

function textOrNull(value: FormDataEntryValue | null): string | null {
  const raw = value === null ? '' : String(value).trim()
  return raw ? raw : null
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export async function createDealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let dealId: string
  try {
    const actor = await requireActor()
    const lineItems: Record<string, number | null> = {}
    for (const key of ['revenue', 'ebitda', 'labor_expense', 'agency_labor', 'rent', 'net_income'] as const) {
      const value = numberOrNull(formData.get(`fin_${key}`))
      if (value !== null) lineItems[key] = value
    }

    const deal = await createDeal({
      actor,
      name: String(formData.get('facilityName') ?? '').trim() || 'Untitled facility',
      assetType: (formData.get('assetType') as AssetType) ?? 'snf',
      transactionType: (formData.get('transactionType') as TransactionType) ?? 'acquisition',
      borrowerPriority: (formData.get('borrowerPriority') as BorrowerPriority) ?? 'lowest_rate',
      anonymize: formData.get('anonymize') !== 'off',
      narrative: textOrNull(formData.get('narrative')),
      facility: {
        name: String(formData.get('facilityName') ?? '').trim() || 'Untitled facility',
        state: String(formData.get('state') ?? '').trim().toUpperCase(),
        address_line1: textOrNull(formData.get('addressLine1')),
        city: textOrNull(formData.get('city')),
        zip: textOrNull(formData.get('zip')),
        county: textOrNull(formData.get('county')),
        licensed_beds: numberOrNull(formData.get('licensedBeds')),
        certified_beds: numberOrNull(formData.get('certifiedBeds')),
        operating_beds: numberOrNull(formData.get('operatingBeds')),
        current_census: numberOrNull(formData.get('currentCensus')),
        occupancy_pct: numberOrNull(formData.get('occupancyPct')),
        ownership_structure: textOrNull(formData.get('ownershipStructure')),
        year_built: numberOrNull(formData.get('yearBuilt')),
        last_renovation_year: numberOrNull(formData.get('lastRenovationYear')),
        property_type: textOrNull(formData.get('propertyType')),
        real_estate_included: formData.get('realEstateIncluded') !== 'no',
        operating_company: textOrNull(formData.get('operatingCompany')),
        management_company: textOrNull(formData.get('managementCompany')),
      },
      terms: {
        purchase_price: numberOrNull(formData.get('purchasePrice')),
        requested_financing: numberOrNull(formData.get('requestedFinancing')),
        existing_debt: numberOrNull(formData.get('existingDebt')),
        seller_financing: numberOrNull(formData.get('sellerFinancing')),
        cash_equity: numberOrNull(formData.get('cashEquity')),
        appraised_value: numberOrNull(formData.get('appraisedValue')),
        estimated_closing_costs: numberOrNull(formData.get('closingCosts')),
        working_capital_requirement: numberOrNull(formData.get('workingCapital')),
        capex_requirement: numberOrNull(formData.get('capexRequirement')),
        target_close_date: textOrNull(formData.get('targetCloseDate')),
        purchase_agreement_status: textOrNull(formData.get('purchaseAgreementStatus')),
        loi_status: textOrNull(formData.get('loiStatus')),
        requested_rate_pct: numberOrNull(formData.get('requestedRatePct')),
        requested_term_months: numberOrNull(formData.get('requestedTermMonths')),
        requested_amortization_months: numberOrNull(formData.get('requestedAmortMonths')),
        requested_io_months: numberOrNull(formData.get('requestedIoMonths')),
      },
      sponsor: {
        legal_entity: textOrNull(formData.get('legalEntity')) ?? actor.company.name,
        years_in_healthcare: numberOrNull(formData.get('yearsInHealthcare')),
        years_operating_asset_type: numberOrNull(formData.get('yearsOperatingAssetType')),
        facilities_operated: numberOrNull(formData.get('facilitiesOperated')),
        beds_operated: numberOrNull(formData.get('bedsOperated')),
        states_operated: String(formData.get('statesOperated') ?? '')
          .split(',')
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean),
        historical_acquisitions: numberOrNull(formData.get('historicalAcquisitions')),
        previous_exits: numberOrNull(formData.get('previousExits')),
        prior_defaults: formData.get('priorDefaults') === 'yes',
        net_worth: numberOrNull(formData.get('netWorth')),
        liquidity: numberOrNull(formData.get('liquidity')),
        management_team: textOrNull(formData.get('managementTeam')),
        relevant_experience: textOrNull(formData.get('relevantExperience')),
      },
      operating: {
        fiscalYear: numberOrNull(formData.get('fiscalYear')) ?? new Date().getUTCFullYear() - 1,
        lineItems,
        occupancyPct: numberOrNull(formData.get('occupancyPct')),
        averageCensus: numberOrNull(formData.get('currentCensus')),
        medicarePct: numberOrNull(formData.get('medicarePct')),
        medicaidPct: numberOrNull(formData.get('medicaidPct')),
        privatePayPct: numberOrNull(formData.get('privatePayPct')),
        managedCarePct: numberOrNull(formData.get('managedCarePct')),
        otherPayerPct: numberOrNull(formData.get('otherPayerPct')),
      },
    })
    dealId = deal.id
  } catch (error) {
    return fail(error)
  }
  redirect(`/deals/${dealId}/documents?created=1`)
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export async function updateFacilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await updateFacility(actor, dealId, {
      name: String(formData.get('name') ?? '').trim(),
      address_line1: textOrNull(formData.get('address_line1')),
      city: textOrNull(formData.get('city')),
      state: String(formData.get('state') ?? '').trim().toUpperCase(),
      zip: textOrNull(formData.get('zip')),
      county: textOrNull(formData.get('county')),
      licensed_beds: numberOrNull(formData.get('licensed_beds')),
      certified_beds: numberOrNull(formData.get('certified_beds')),
      operating_beds: numberOrNull(formData.get('operating_beds')),
      current_census: numberOrNull(formData.get('current_census')),
      occupancy_pct: numberOrNull(formData.get('occupancy_pct')),
      ownership_structure: textOrNull(formData.get('ownership_structure')),
      year_built: numberOrNull(formData.get('year_built')),
      last_renovation_year: numberOrNull(formData.get('last_renovation_year')),
      property_type: textOrNull(formData.get('property_type')),
      real_estate_included: formData.get('real_estate_included') === 'yes',
      operating_company: textOrNull(formData.get('operating_company')),
      management_company: textOrNull(formData.get('management_company')),
      cms_star_rating: numberOrNull(formData.get('cms_star_rating')),
    })
    await enqueue({ kind: 'deal.reconcile', payload: { dealId }, dealId })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Facility details saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updateTermsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await updateTerms(actor, dealId, {
      purchase_price: numberOrNull(formData.get('purchase_price')),
      requested_financing: numberOrNull(formData.get('requested_financing')),
      existing_debt: numberOrNull(formData.get('existing_debt')),
      seller_financing: numberOrNull(formData.get('seller_financing')),
      cash_equity: numberOrNull(formData.get('cash_equity')),
      appraised_value: numberOrNull(formData.get('appraised_value')),
      estimated_closing_costs: numberOrNull(formData.get('estimated_closing_costs')),
      working_capital_requirement: numberOrNull(formData.get('working_capital_requirement')),
      capex_requirement: numberOrNull(formData.get('capex_requirement')),
      target_close_date: textOrNull(formData.get('target_close_date')),
      purchase_agreement_status: textOrNull(formData.get('purchase_agreement_status')),
      loi_status: textOrNull(formData.get('loi_status')),
      requested_rate_pct: numberOrNull(formData.get('requested_rate_pct')),
      requested_term_months: numberOrNull(formData.get('requested_term_months')),
      requested_amortization_months: numberOrNull(formData.get('requested_amortization_months')),
      requested_io_months: numberOrNull(formData.get('requested_io_months')),
    })
    await enqueue({ kind: 'deal.reconcile', payload: { dealId }, dealId })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Transaction terms saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updateSponsorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await updateSponsor(actor, dealId, {
      legal_entity: String(formData.get('legal_entity') ?? '').trim(),
      years_in_healthcare: numberOrNull(formData.get('years_in_healthcare')),
      years_operating_asset_type: numberOrNull(formData.get('years_operating_asset_type')),
      facilities_operated: numberOrNull(formData.get('facilities_operated')),
      beds_operated: numberOrNull(formData.get('beds_operated')),
      states_operated: String(formData.get('states_operated') ?? '')
        .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      historical_acquisitions: numberOrNull(formData.get('historical_acquisitions')),
      previous_exits: numberOrNull(formData.get('previous_exits')),
      prior_defaults: formData.get('prior_defaults') === 'yes',
      bankruptcy_history: formData.get('bankruptcy_history') === 'yes',
      net_worth: numberOrNull(formData.get('net_worth')),
      liquidity: numberOrNull(formData.get('liquidity')),
      management_team: textOrNull(formData.get('management_team')),
      key_executives: textOrNull(formData.get('key_executives')),
      relevant_experience: textOrNull(formData.get('relevant_experience')),
    })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Sponsor information saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updateDealSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot edit this deal.')

    const { db } = await import('@/db')
    const store = await db()
    await store.update('deals', dealId, {
      name: String(formData.get('name') ?? deal.name).trim() || deal.name,
      narrative: textOrNull(formData.get('narrative')),
      borrower_priority: (formData.get('borrower_priority') as BorrowerPriority) ?? deal.borrower_priority,
      anonymize_in_marketplace: formData.get('anonymize_in_marketplace') === 'yes',
    })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Deal settings saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function approveLineItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const lineItemId = String(formData.get('lineItemId'))
    const dealId = String(formData.get('dealId'))
    await approveLineItem(actor, lineItemId, numberOrNull(formData.get('value')))
    await enqueue({ kind: 'deal.reconcile', payload: { dealId }, dealId })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Value approved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function transitionDealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await transitionDeal(actor, dealId, formData.get('status') as DealStatus, textOrNull(formData.get('reason')) ?? undefined)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Deal status updated.' }
  } catch (error) {
    return fail(error)
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const docType = (formData.get('docType') as DocumentType) ?? 'other'
    const visibility = (formData.get('visibility') as 'deal_team' | 'distributed_lenders' | 'restricted') ?? 'distributed_lenders'
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0)

    if (!files.length) return { error: 'Choose at least one file to upload.' }

    let uploaded = 0
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return { error: `${file.name} is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` }
      }
      await uploadDocument({
        actor,
        dealId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()),
        docType,
        displayName: files.length === 1 ? textOrNull(formData.get('displayName')) ?? file.name : file.name,
        visibility,
      })
      uploaded++
    }

    revalidatePath(`/deals/${dealId}`, 'layout')
    return {
      success: `${uploaded} document${uploaded === 1 ? '' : 's'} uploaded. Extraction is running — figures will appear for your review shortly.`,
    }
  } catch (error) {
    return fail(error)
  }
}

export async function updateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await updateDocument(actor, String(formData.get('documentId')), {
      display_name: String(formData.get('display_name') ?? '').trim() || undefined,
      doc_type: (formData.get('doc_type') as DocumentType) || undefined,
      visibility: (formData.get('visibility') as 'deal_team' | 'distributed_lenders' | 'restricted') || undefined,
    })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Document updated.' }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await softDeleteDocument(actor, String(formData.get('documentId')))
    await enqueue({ kind: 'deal.reconcile', payload: { dealId }, dealId })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Document removed from the data room.' }
  } catch (error) {
    return fail(error)
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function runAnalysisAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot run analysis on this deal.')

    await runReconciliation(dealId)
    await runUnderwriting(dealId, { actor, force: true })
    await computeMatches(dealId)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Underwriting analysis complete.' }
  } catch (error) {
    return fail(error)
  }
}

export async function resolveDiscrepancyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot resolve issues on this deal.')

    await resolveDiscrepancy({
      actor,
      discrepancyId: String(formData.get('discrepancyId')),
      action: (formData.get('action') as 'resolve' | 'ignore' | 'request_clarification') ?? 'resolve',
      note: String(formData.get('note') ?? '').trim() || 'No note provided.',
      acceptedValue: textOrNull(formData.get('acceptedValue')),
    })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Item updated.' }
  } catch (error) {
    return fail(error)
  }
}

export async function generateMemoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot generate a memo for this deal.')
    await generateCreditMemo(dealId, actor)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Credit memo generated.' }
  } catch (error) {
    return fail(error)
  }
}

export async function saveMemoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot edit this memo.')

    const sections = JSON.parse(String(formData.get('sections') ?? '[]')) as MemoSection[]
    if (!Array.isArray(sections) || !sections.length) return { error: 'No memo content to save.' }
    await saveMemoEdit(dealId, actor, sections, textOrNull(formData.get('notes')) ?? undefined)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Memo saved as a new version.' }
  } catch (error) {
    return fail(error)
  }
}

// ---------------------------------------------------------------------------
// Distribution and indications
// ---------------------------------------------------------------------------

export async function distributeDealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const lenderIds = formData.getAll('lenderIds').map(String).filter(Boolean)
    if (!lenderIds.length) return { error: 'Select at least one lender.' }

    const result = await distributeDeal({
      actor,
      dealId,
      scope: (formData.get('scope') as DistributionScope) ?? 'selected_lenders',
      lenderIds,
      overrideReadiness: formData.get('override') === 'yes',
      message: textOrNull(formData.get('message')),
    })
    await enqueue({ kind: 'deal.alerts', payload: { dealId }, dealId })
    revalidatePath(`/deals/${dealId}`, 'layout')
    return {
      success: `Shared with ${result.distributions.length} lender${result.distributions.length === 1 ? '' : 's'}.${
        result.skipped.length ? ` Skipped ${result.skipped.length} unverified institution(s).` : ''
      }`,
    }
  } catch (error) {
    return fail(error)
  }
}

export async function revokeDistributionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await revokeDistribution(actor, String(formData.get('distributionId')), String(formData.get('reason') ?? 'Withdrawn by borrower.'))
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Lender access revoked.' }
  } catch (error) {
    return fail(error)
  }
}

export async function selectIndicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    await selectIndication(actor, String(formData.get('indicationId')), textOrNull(formData.get('note')) ?? undefined)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: 'Preferred indication selected. The deal has moved to diligence.' }
  } catch (error) {
    return fail(error)
  }
}

export async function recomputeMatchesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canDistributeDeal(subject, deal) || subject.isAdmin, 'You cannot recompute matches for this deal.')
    const result = await computeMatches(dealId)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return { success: `${result.inBox} lenders match this opportunity.` }
  } catch (error) {
    return fail(error)
  }
}

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export async function postMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const threadId = textOrNull(formData.get('threadId'))
    const body = String(formData.get('body') ?? '').trim()
    if (body.length < 2) return { error: 'Write a message before sending.' }

    if (threadId) {
      await postMessage(actor, threadId, body)
    } else {
      const subject = String(formData.get('subject') ?? '').trim()
      if (!subject) return { error: 'Give the thread a subject.' }
      await openThread(actor, dealId, subject, body, actor.isLender ? 'lender_question' : 'deal_team')
    }
    revalidatePath(`/deals/${dealId}`, 'layout')
    revalidatePath(`/lender/deals/${dealId}`, 'layout')
    return { success: 'Message sent.' }
  } catch (error) {
    return fail(error)
  }
}

export async function requestDocumentsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const items = formData.getAll('items').map(String).filter(Boolean)
    if (!items.length) return { error: 'Select at least one item to request.' }

    await createDataRequests(
      actor,
      dealId,
      items.map((entry) => {
        const [label, docType] = entry.split('::')
        return { label: label!, docType: (docType as DocumentType) ?? 'other', source: 'ai_recommendation' as const }
      }),
    )
    revalidatePath(`/deals/${dealId}`, 'layout')
    revalidatePath(`/lender/deals/${dealId}`, 'layout')
    return { success: `Requested ${items.length} item${items.length === 1 ? '' : 's'} from the borrower.` }
  } catch (error) {
    return fail(error)
  }
}

export interface AskState {
  question?: string
  answer?: string
  citations?: { document_id: string | null; label: string; page: number | null }[]
  insufficient?: boolean
  error?: string
}

export async function askDealAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const question = String(formData.get('question') ?? '').trim()
  if (question.length < 3) return { error: 'Ask a question about this deal.' }

  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    // Reading the deal is authorization enough to ask about it.
    await loadDealForActor(actor, dealId)
    const result = await askDeal(dealId, question)
    return {
      question,
      answer: result.answer,
      citations: result.citations.map((c) => ({ document_id: c.document_id, label: c.label, page: c.page })),
      insufficient: result.insufficient_information,
    }
  } catch (error) {
    return { question, ...fail(error) }
  }
}

export async function reconcileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const dealId = String(formData.get('dealId'))
    const { deal, subject } = await loadDealForActor(actor, dealId)
    authorize(canEditDeal(subject, deal), 'You cannot run reconciliation on this deal.')
    const outcome = await runReconciliation(dealId)
    revalidatePath(`/deals/${dealId}`, 'layout')
    return {
      success: `Reconciliation complete: ${outcome.created} new, ${outcome.updated} updated, ${outcome.autoClosed} closed. ${outcome.open} open.`,
    }
  } catch (error) {
    return fail(error)
  }
}
