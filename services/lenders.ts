import 'server-only'
import { db } from '@/db'
import { authorize, canManageCompany, canVerifyLenders } from '@/lib/policy'
import { subjectOf } from '@/lib/access'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { matchDeal } from '@/lib/matching/engine'
import { toMatchableBox, toMatchableDeal } from './matching'
import { buildSnapshot } from '@/lib/deal/snapshot'
import type { Actor } from '@/lib/auth/session'
import type { Lender, LenderVerification, LendingBox, SavedSearch, SavedSearchCriteria } from '@/types'

/**
 * Lender profiles, lending boxes, verification and alerts.
 *
 * A lender's box is the contract they publish to the platform: it drives
 * matching, deal distribution eligibility and their alerts. Editing it
 * recomputes nothing on its own — matches are recomputed per deal — but it does
 * take effect immediately for any new match run.
 */

export async function upsertLendingBox(
  actor: Actor,
  patch: Partial<LendingBox> & { name?: string },
): Promise<LendingBox> {
  const store = await db()
  const lender = actor.lender
  if (!lender) throw new Error('Only a lender organisation can define a lending box.')
  authorize(canManageCompany(subjectOf(actor), actor.company.id), 'You cannot edit your institution\'s lending criteria.')

  const existing = await store.selectOne('lender_lending_boxes', { where: { lender_id: lender.id } })
  const box = existing
    ? await store.update('lender_lending_boxes', existing.id, patch)
    : await store.insert('lender_lending_boxes', {
        lender_id: lender.id,
        name: patch.name ?? 'Primary lending box',
        active: true,
        min_loan: patch.min_loan ?? null,
        max_loan: patch.max_loan ?? null,
        max_ltv_pct: patch.max_ltv_pct ?? null,
        min_dscr: patch.min_dscr ?? null,
        min_debt_yield_pct: patch.min_debt_yield_pct ?? null,
        min_occupancy_pct: patch.min_occupancy_pct ?? null,
        states: patch.states ?? [],
        excluded_states: patch.excluded_states ?? [],
        asset_types: patch.asset_types ?? [],
        excluded_asset_types: patch.excluded_asset_types ?? [],
        transaction_types: patch.transaction_types ?? [],
        min_operator_years: patch.min_operator_years ?? null,
        min_facilities_operated: patch.min_facilities_operated ?? null,
        max_medicaid_pct: patch.max_medicaid_pct ?? null,
        min_private_pay_pct: patch.min_private_pay_pct ?? null,
        preferred_deal_size: patch.preferred_deal_size ?? null,
        loan_purposes: patch.loan_purposes ?? [],
        typical_rate_low_pct: patch.typical_rate_low_pct ?? null,
        typical_rate_high_pct: patch.typical_rate_high_pct ?? null,
        typical_term_months: patch.typical_term_months ?? null,
        requires_appraisal: patch.requires_appraisal ?? true,
        requires_environmental: patch.requires_environmental ?? false,
        required_tax_return_years: patch.required_tax_return_years ?? 2,
        notes: patch.notes ?? null,
      } as Omit<LendingBox, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor,
    action: 'lender.box_updated',
    entityType: 'lender_lending_box',
    entityId: box.id,
    summary: `${lender.institution_name} updated their lending criteria.`,
    metadata: { fields: Object.keys(patch) },
  })
  return box
}

export async function updateLenderProfile(actor: Actor, patch: Partial<Lender>): Promise<Lender> {
  const store = await db()
  const lender = actor.lender
  if (!lender) throw new Error('No lender profile for this organisation.')
  authorize(canManageCompany(subjectOf(actor), actor.company.id), 'You cannot edit this lender profile.')

  // Verification status is never self-serve.
  const { verification_status: _ignored, verified_at: _a, verified_by: _b, ...safe } = patch
  const updated = await store.update('lenders', lender.id, safe)
  await recordAudit({
    actor, action: 'lender.profile_updated', entityType: 'lender', entityId: lender.id,
    summary: `${lender.institution_name} updated their profile.`, metadata: { fields: Object.keys(safe) },
  })
  return updated
}

export async function setVerification(
  actor: Actor,
  lenderId: string,
  status: LenderVerification,
  note?: string,
): Promise<Lender> {
  const store = await db()
  authorize(canVerifyLenders(subjectOf(actor)), 'Only an administrator can verify lenders.')
  const lender = await store.findById('lenders', lenderId)
  if (!lender) throw new Error('Lender not found.')

  const updated = await store.update('lenders', lenderId, {
    verification_status: status,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
    verified_by: actor.user.id,
  })

  await recordAudit({
    actor,
    action: 'lender.verification_changed',
    entityType: 'lender',
    entityId: lenderId,
    summary: `${actor.user.full_name} set ${lender.institution_name} to ${status}.`,
    metadata: { from: lender.verification_status, to: status, note: note ?? null },
  })

  await notify({
    event: 'lender.verified',
    companyId: lender.company_id,
    title:
      status === 'verified'
        ? 'Your institution has been verified'
        : `Your verification status is now ${status}`,
    body:
      status === 'verified'
        ? 'You now have access to matched financing opportunities and the marketplace.'
        : note ?? 'Contact the platform administrator for details.',
    href: '/lender',
  })

  return updated
}

export async function lenderById(lenderId: string): Promise<{ lender: Lender; box: LendingBox | null } | null> {
  const store = await db()
  const lender = await store.findById('lenders', lenderId)
  if (!lender) return null
  const box = await store.selectOne('lender_lending_boxes', { where: { lender_id: lenderId } })
  return { lender, box }
}

export async function allLenders(): Promise<{ lender: Lender; box: LendingBox | null }[]> {
  const store = await db()
  const [lenders, boxes] = await Promise.all([
    store.select('lenders', { orderBy: { field: 'institution_name', dir: 'asc' } }),
    store.select('lender_lending_boxes', {}),
  ])
  return lenders.map((lender) => ({
    lender,
    box: boxes.find((b) => b.lender_id === lender.id) ?? null,
  }))
}

/**
 * Fields a lender has chosen to publish. Everything not listed stays internal,
 * which is how a lender participates without revealing their strategy.
 */
export const PUBLISHABLE_PROFILE_FIELDS = [
  'description', 'asset_types', 'states', 'loan_range', 'transaction_types',
  'typical_rate', 'typical_term', 'contact',
] as const

export function publicProfile(lender: Lender, box: LendingBox | null) {
  const allowed = new Set(lender.public_profile_fields)
  return {
    institution_name: lender.institution_name,
    institution_type: lender.institution_type,
    logo_initials: lender.logo_initials,
    verification_status: lender.verification_status,
    description: allowed.has('description') ? lender.description : null,
    asset_types: allowed.has('asset_types') ? box?.asset_types ?? [] : [],
    states: allowed.has('states') ? box?.states ?? [] : [],
    loan_range: allowed.has('loan_range') ? { min: box?.min_loan ?? null, max: box?.max_loan ?? null } : null,
    transaction_types: allowed.has('transaction_types') ? box?.transaction_types ?? [] : [],
    typical_rate: allowed.has('typical_rate')
      ? { low: box?.typical_rate_low_pct ?? null, high: box?.typical_rate_high_pct ?? null }
      : null,
    typical_term_months: allowed.has('typical_term') ? box?.typical_term_months ?? null : null,
    // Contact routing goes through the platform unless the lender opts in.
    contact: allowed.has('contact')
      ? { name: lender.contact_name, email: lender.contact_email }
      : null,
  }
}

// ---------------------------------------------------------------------------
// Saved searches and alerts
// ---------------------------------------------------------------------------

export async function saveSearch(
  actor: Actor,
  name: string,
  criteria: SavedSearchCriteria,
  options: { alertEnabled?: boolean; kind?: SavedSearch['kind'] } = {},
): Promise<SavedSearch> {
  const store = await db()
  return store.insert('saved_searches', {
    user_id: actor.user.id,
    company_id: actor.company.id,
    name,
    kind: options.kind ?? 'lender_marketplace',
    criteria,
    alert_enabled: options.alertEnabled ?? false,
    last_alert_at: null,
  } as Omit<SavedSearch, 'id' | 'created_at'>)
}

export async function savedSearches(actor: Actor): Promise<SavedSearch[]> {
  const store = await db()
  return store.select('saved_searches', { where: { user_id: actor.user.id } })
}

export async function deleteSavedSearch(actor: Actor, searchId: string): Promise<void> {
  const store = await db()
  const search = await store.findById('saved_searches', searchId)
  if (search?.user_id !== actor.user.id) return
  await store.remove('saved_searches', searchId)
}

/**
 * Notifies lenders whose alert criteria a newly distributed deal satisfies.
 * Alerts respect the lending box: a lender is never alerted to a deal that
 * would immediately fail their own stated boundaries.
 */
export async function runLenderAlerts(dealId: string): Promise<number> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) return 0
  if (snapshot.deal.distribution_scope !== 'marketplace') return 0

  const matchable = toMatchableDeal(snapshot)
  const searches = await store.select('saved_searches', { where: { alert_enabled: true } })
  const boxes = await store.select('lender_lending_boxes', { where: { active: true } })
  const lenders = await store.select('lenders', { where: { verification_status: 'verified' } })

  let sent = 0
  for (const search of searches) {
    const lender = lenders.find((l) => l.company_id === search.company_id)
    if (!lender) continue
    if (!criteriaMatches(search.criteria, matchable)) continue

    const box = boxes.find((b) => b.lender_id === lender.id)
    if (box && matchDeal(matchable, toMatchableBox(box)).hardFail) continue

    await notify({
      event: 'match.found',
      companyId: search.company_id,
      userIds: [search.user_id],
      dealId,
      title: `New opportunity matching "${search.name}"`,
      body: `A ${matchable.assetType.toUpperCase()} opportunity in ${matchable.state} matching your saved criteria has been posted.`,
      href: `/marketplace`,
    })
    await store.update('saved_searches', search.id, { last_alert_at: new Date().toISOString() })
    sent++
  }
  return sent
}

export function criteriaMatches(criteria: SavedSearchCriteria, deal: ReturnType<typeof toMatchableDeal>): boolean {
  if (criteria.states?.length && !criteria.states.map((s) => s.toUpperCase()).includes(deal.state.toUpperCase())) return false
  if (criteria.asset_types?.length && !criteria.asset_types.includes(deal.assetType)) return false
  if (criteria.transaction_types?.length && !criteria.transaction_types.includes(deal.transactionType)) return false
  if (criteria.min_loan != null && (deal.loanAmount ?? 0) < criteria.min_loan) return false
  if (criteria.max_loan != null && (deal.loanAmount ?? Infinity) > criteria.max_loan) return false
  if (criteria.max_ltv_pct != null && deal.ltvPct !== null && deal.ltvPct > criteria.max_ltv_pct) return false
  if (criteria.min_dscr != null && deal.dscr !== null && deal.dscr < criteria.min_dscr) return false
  if (criteria.min_debt_yield_pct != null && deal.debtYieldPct !== null && deal.debtYieldPct < criteria.min_debt_yield_pct) return false
  if (criteria.min_occupancy_pct != null && deal.occupancyPct !== null && deal.occupancyPct < criteria.min_occupancy_pct) return false
  if (criteria.max_medicaid_pct != null && deal.medicaidPct !== null && deal.medicaidPct > criteria.max_medicaid_pct) return false
  return true
}

export async function lenderNotes(actor: Actor, dealId: string) {
  const store = await db()
  if (!actor.lender) return []
  return store.select('lender_notes', {
    where: { deal_id: dealId, lender_id: actor.lender.id },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}

export async function addLenderNote(actor: Actor, dealId: string, body: string) {
  const store = await db()
  if (!actor.lender) throw new Error('Only a lender organisation can add internal notes.')
  authorize(actor.canWrite, 'Your role does not permit adding notes.')
  return store.insert('lender_notes', {
    deal_id: dealId,
    lender_id: actor.lender.id,
    author_id: actor.user.id,
    body,
  } as never)
}
