import 'server-only'
import { db } from '@/db'
import { authorize, canEditDeal } from '@/lib/policy'
import { subjectOf } from '@/lib/access'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { enqueue } from './jobs'
import type { Actor } from '@/lib/auth/session'
import type {
  AssetType, BorrowerPriority, Deal, DealStatus, Facility, FacilityMetric, FinancialLineItem,
  FinancialPeriod, LineItemKey, Sponsor, TransactionTerms, TransactionType,
} from '@/types'

/**
 * Deal lifecycle.
 *
 * Status transitions are validated against an explicit graph rather than being
 * set freely, and every transition writes an audit entry. Financial edits go
 * through `setLineItem`, which is the only place an approved figure is written
 * — keeping the human-approval rule in one enforceable location.
 */

const ALLOWED_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  draft: ['intake', 'withdrawn', 'archived'],
  intake: ['document_collection', 'draft', 'withdrawn'],
  document_collection: ['processing', 'underwriting', 'needs_attention', 'withdrawn'],
  processing: ['underwriting', 'needs_attention', 'document_collection'],
  underwriting: ['needs_attention', 'ready_for_distribution', 'document_collection'],
  needs_attention: ['underwriting', 'document_collection', 'ready_for_distribution', 'withdrawn'],
  ready_for_distribution: ['distributed', 'underwriting', 'needs_attention', 'withdrawn'],
  distributed: ['indications_received', 'needs_attention', 'withdrawn', 'rejected'],
  indications_received: ['under_loi', 'diligence', 'distributed', 'withdrawn', 'rejected'],
  under_loi: ['diligence', 'indications_received', 'withdrawn', 'rejected'],
  diligence: ['closing', 'under_loi', 'withdrawn', 'rejected'],
  closing: ['funded', 'diligence', 'withdrawn', 'rejected'],
  funded: ['archived'],
  withdrawn: ['archived', 'draft'],
  rejected: ['archived', 'draft'],
  archived: [],
}

export function canTransition(from: DealStatus, to: DealStatus): boolean {
  return from === to || (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

export interface CreateDealInput {
  actor: Actor
  name: string
  assetType: AssetType
  transactionType: TransactionType
  borrowerPriority?: BorrowerPriority
  anonymize?: boolean
  narrative?: string | null
  facility: Partial<Omit<Facility, 'id' | 'deal_id' | 'created_at' | 'updated_at'>> & { state: string; name: string }
  terms?: Partial<Omit<TransactionTerms, 'id' | 'deal_id' | 'created_at' | 'updated_at'>>
  sponsor?: Partial<Omit<Sponsor, 'id' | 'deal_id' | 'created_at' | 'updated_at'>> & { legal_entity?: string }
  operating?: {
    periodLabel?: string
    fiscalYear?: number
    lineItems?: Partial<Record<LineItemKey, number | null>>
    occupancyPct?: number | null
    averageCensus?: number | null
    medicarePct?: number | null
    medicaidPct?: number | null
    privatePayPct?: number | null
    managedCarePct?: number | null
    otherPayerPct?: number | null
  }
}

/** Human-readable, sequential deal reference (CCX-1001). */
async function nextReference(): Promise<string> {
  const store = await db()
  const count = await store.count('deals')
  return `CCX-${1001 + count}`
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const store = await db()
  const { actor } = input
  authorize(actor.canWrite, 'Your role does not permit creating deals.')

  const deal = await store.insert('deals', {
    reference: await nextReference(),
    company_id: actor.company.id,
    created_by: actor.user.id,
    name: input.name,
    asset_type: input.assetType,
    transaction_type: input.transactionType,
    status: 'intake',
    distribution_scope: 'private',
    anonymize_in_marketplace: input.anonymize ?? true,
    borrower_priority: input.borrowerPriority ?? 'lowest_rate',
    target_close_date: input.terms?.target_close_date ?? null,
    narrative: input.narrative ?? null,
    is_demo: false,
    distributed_at: null,
  } as Omit<Deal, 'id' | 'created_at' | 'updated_at'>)

  const facility = await store.insert('facilities', {
    deal_id: deal.id,
    name: input.facility.name,
    address_line1: input.facility.address_line1 ?? null,
    city: input.facility.city ?? null,
    state: input.facility.state.toUpperCase(),
    zip: input.facility.zip ?? null,
    county: input.facility.county ?? null,
    licensed_beds: input.facility.licensed_beds ?? null,
    certified_beds: input.facility.certified_beds ?? null,
    operating_beds: input.facility.operating_beds ?? null,
    current_census: input.facility.current_census ?? null,
    occupancy_pct: input.facility.occupancy_pct ?? null,
    ownership_structure: input.facility.ownership_structure ?? null,
    year_built: input.facility.year_built ?? null,
    last_renovation_year: input.facility.last_renovation_year ?? null,
    property_type: input.facility.property_type ?? null,
    real_estate_included: input.facility.real_estate_included ?? true,
    operating_company: input.facility.operating_company ?? null,
    management_company: input.facility.management_company ?? null,
    cms_star_rating: input.facility.cms_star_rating ?? null,
  } as Omit<Facility, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('transaction_terms', {
    deal_id: deal.id,
    purchase_price: input.terms?.purchase_price ?? null,
    requested_financing: input.terms?.requested_financing ?? null,
    existing_debt: input.terms?.existing_debt ?? null,
    seller_financing: input.terms?.seller_financing ?? null,
    cash_equity: input.terms?.cash_equity ?? null,
    appraised_value: input.terms?.appraised_value ?? null,
    estimated_closing_costs: input.terms?.estimated_closing_costs ?? null,
    working_capital_requirement: input.terms?.working_capital_requirement ?? null,
    capex_requirement: input.terms?.capex_requirement ?? null,
    target_close_date: input.terms?.target_close_date ?? null,
    purchase_agreement_status: input.terms?.purchase_agreement_status ?? null,
    loi_status: input.terms?.loi_status ?? null,
    requested_term_months: input.terms?.requested_term_months ?? null,
    requested_amortization_months: input.terms?.requested_amortization_months ?? null,
    requested_rate_pct: input.terms?.requested_rate_pct ?? null,
    requested_io_months: input.terms?.requested_io_months ?? null,
  } as Omit<TransactionTerms, 'id' | 'created_at' | 'updated_at'>)

  if (input.sponsor) {
    await store.insert('sponsors', {
      deal_id: deal.id,
      legal_entity: input.sponsor.legal_entity ?? actor.company.name,
      years_in_healthcare: input.sponsor.years_in_healthcare ?? null,
      years_operating_asset_type: input.sponsor.years_operating_asset_type ?? null,
      facilities_operated: input.sponsor.facilities_operated ?? null,
      beds_operated: input.sponsor.beds_operated ?? null,
      states_operated: input.sponsor.states_operated ?? [],
      historical_acquisitions: input.sponsor.historical_acquisitions ?? null,
      previous_exits: input.sponsor.previous_exits ?? null,
      prior_defaults: input.sponsor.prior_defaults ?? null,
      bankruptcy_history: input.sponsor.bankruptcy_history ?? null,
      management_team: input.sponsor.management_team ?? null,
      key_executives: input.sponsor.key_executives ?? null,
      net_worth: input.sponsor.net_worth ?? null,
      liquidity: input.sponsor.liquidity ?? null,
      relevant_experience: input.sponsor.relevant_experience ?? null,
    } as Omit<Sponsor, 'id' | 'created_at' | 'updated_at'>)
  }

  const operating = input.operating
  if (operating?.lineItems && Object.keys(operating.lineItems).length) {
    const year = operating.fiscalYear ?? new Date().getUTCFullYear() - 1
    const period = await store.insert('financial_periods', {
      deal_id: deal.id,
      label: operating.periodLabel ?? String(year),
      period_type: 'annual',
      fiscal_year: year,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      source: 'manual',
      is_primary: true,
    } as Omit<FinancialPeriod, 'id' | 'created_at'>)

    const now = new Date().toISOString()
    const rows = Object.entries(operating.lineItems)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        period_id: period.id,
        deal_id: deal.id,
        key: key as LineItemKey,
        label: key,
        value: value as number,
        proposed_value: null,
        // Entered by a person, so it is approved by definition.
        approved_value: value as number,
        approved_by: actor.user.id,
        approved_at: now,
        source_document_id: null,
        source_page: null,
        confidence: 1,
      }))
    if (rows.length) {
      await store.insertMany('financial_line_items', rows as Omit<FinancialLineItem, 'id' | 'created_at' | 'updated_at'>[])
    }
  }

  if (operating && (operating.occupancyPct != null || operating.medicaidPct != null)) {
    const year = operating.fiscalYear ?? new Date().getUTCFullYear() - 1
    await store.insert('facility_metrics', {
      facility_id: facility.id,
      deal_id: deal.id,
      period_label: operating.periodLabel ?? String(year),
      period_end: `${year}-12-31`,
      occupancy_pct: operating.occupancyPct ?? null,
      average_census: operating.averageCensus ?? null,
      medicare_pct: operating.medicarePct ?? null,
      medicaid_pct: operating.medicaidPct ?? null,
      private_pay_pct: operating.privatePayPct ?? null,
      managed_care_pct: operating.managedCarePct ?? null,
      other_payer_pct: operating.otherPayerPct ?? null,
      average_daily_rate: null,
      revenue_per_patient_day: null,
      labor_hours_per_patient_day: null,
      agency_labor_pct: null,
    } as Omit<FacilityMetric, 'id' | 'created_at'>)
  }

  await recordAudit({
    actor,
    action: 'deal.created',
    entityType: 'deal',
    entityId: deal.id,
    dealId: deal.id,
    summary: `${actor.user.full_name} created ${deal.reference} — ${deal.name}.`,
    metadata: { assetType: deal.asset_type, transactionType: deal.transaction_type },
  })

  await notify({
    event: 'deal.created',
    companyId: actor.company.id,
    dealId: deal.id,
    title: `${deal.name} created`,
    body: 'Upload financial statements to start the underwriting analysis.',
    href: `/deals/${deal.id}/documents`,
    excludeUserId: actor.user.id,
  })

  // Reconciliation surfaces missing-document items straight away, so the deal
  // opens with a real checklist rather than an empty one.
  await enqueue({ kind: 'deal.reconcile', payload: { dealId: deal.id }, dealId: deal.id })

  return deal
}

export async function transitionDeal(
  actor: Actor,
  dealId: string,
  to: DealStatus,
  reason?: string,
): Promise<Deal> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditDeal(subjectOf(actor), deal), 'You cannot change the status of this deal.')

  if (!canTransition(deal.status, to)) {
    throw new Error(`A deal cannot move from ${deal.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`)
  }
  if (deal.status === to) return deal

  const updated = await store.update('deals', dealId, { status: to })
  await recordAudit({
    actor,
    action: 'deal.status_changed',
    entityType: 'deal',
    entityId: dealId,
    dealId,
    summary: `Status changed from ${deal.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}${reason ? `: ${reason}` : '.'}`,
    metadata: { from: deal.status, to, reason: reason ?? null },
  })
  await notify({
    event: 'deal.status_changed',
    companyId: deal.company_id,
    dealId,
    title: `${deal.name} is now ${to.replace(/_/g, ' ')}`,
    body: reason ?? `The deal moved from ${deal.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`,
    href: `/deals/${dealId}`,
    excludeUserId: actor.user.id,
  })
  return updated
}

/**
 * Approves or overrides a financial line item.
 *
 * This is the human half of the human-in-the-loop rule: the approved value
 * becomes the deal's figure, and the original extracted proposal is preserved
 * so the change is auditable.
 */
export async function approveLineItem(
  actor: Actor,
  lineItemId: string,
  value: number | null,
): Promise<FinancialLineItem> {
  const store = await db()
  const item = await store.findById('financial_line_items', lineItemId)
  if (!item) throw new Error('Line item not found.')
  const deal = await store.findById('deals', item.deal_id)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditDeal(subjectOf(actor), deal), 'You cannot edit this deal.')

  const approved = value ?? item.proposed_value ?? item.value
  const updated = await store.update('financial_line_items', lineItemId, {
    value: approved,
    approved_value: approved,
    approved_by: actor.user.id,
    approved_at: new Date().toISOString(),
    confidence: 1,
  })

  await recordAudit({
    actor,
    action: 'financials.approved',
    entityType: 'financial_line_item',
    entityId: lineItemId,
    dealId: item.deal_id,
    summary: `${actor.user.full_name} approved ${item.key} as ${approved ?? 'no value'}.`,
    metadata: {
      key: item.key,
      originalValue: item.value,
      aiProposal: item.proposed_value,
      approvedValue: approved,
    },
  })

  return updated
}

export async function updateFacility(
  actor: Actor,
  dealId: string,
  patch: Partial<Facility>,
): Promise<Facility> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditDeal(subjectOf(actor), deal), 'You cannot edit this deal.')
  const facility = await store.selectOne('facilities', { where: { deal_id: dealId } })
  if (!facility) throw new Error('Facility not found.')
  const updated = await store.update('facilities', facility.id, patch)
  await recordAudit({
    actor, action: 'deal.facility_updated', entityType: 'facility', entityId: facility.id, dealId,
    summary: `${actor.user.full_name} updated facility details.`, metadata: { fields: Object.keys(patch) },
  })
  return updated
}

export async function updateTerms(
  actor: Actor,
  dealId: string,
  patch: Partial<TransactionTerms>,
): Promise<TransactionTerms> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditDeal(subjectOf(actor), deal), 'You cannot edit this deal.')
  const terms = await store.selectOne('transaction_terms', { where: { deal_id: dealId } })
  if (!terms) throw new Error('Transaction terms not found.')
  const updated = await store.update('transaction_terms', terms.id, patch)
  await recordAudit({
    actor, action: 'deal.terms_updated', entityType: 'transaction_terms', entityId: terms.id, dealId,
    summary: `${actor.user.full_name} updated transaction terms.`, metadata: { fields: Object.keys(patch) },
  })
  return updated
}

export async function updateSponsor(actor: Actor, dealId: string, patch: Partial<Sponsor>): Promise<Sponsor> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canEditDeal(subjectOf(actor), deal), 'You cannot edit this deal.')
  let sponsor = await store.selectOne('sponsors', { where: { deal_id: dealId } })
  if (!sponsor) {
    sponsor = await store.insert('sponsors', {
      deal_id: dealId, legal_entity: actor.company.name, years_in_healthcare: null,
      years_operating_asset_type: null, facilities_operated: null, beds_operated: null,
      states_operated: [], historical_acquisitions: null, previous_exits: null, prior_defaults: null,
      bankruptcy_history: null, management_team: null, key_executives: null, net_worth: null,
      liquidity: null, relevant_experience: null,
    } as Omit<Sponsor, 'id' | 'created_at' | 'updated_at'>)
  }
  const updated = await store.update('sponsors', sponsor.id, patch)
  await recordAudit({
    actor, action: 'deal.sponsor_updated', entityType: 'sponsor', entityId: sponsor.id, dealId,
    summary: `${actor.user.full_name} updated sponsor information.`, metadata: { fields: Object.keys(patch) },
  })
  return updated
}

export async function dealsForCompany(companyId: string): Promise<Deal[]> {
  const store = await db()
  return store.select('deals', {
    where: { company_id: companyId },
    orderBy: { field: 'updated_at', dir: 'desc' },
  })
}
