import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import {
  authorize, canEditOffering, canPublishOffering, canReviewOffering, canViewOffering,
} from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { defaultTiers } from '@/lib/equity/waterfall'
import { recordAudit } from '../audit'
import { recordRaiseFee } from '../billing'
import { notify } from '../notifications'
import type { Actor } from '@/lib/auth/session'
import type {
  ComplianceFinding, ComplianceReview, Offering, OfferingDisclosure, OfferingEligibility,
  OfferingStatus, OfferingTerms, OfferingType, OfferingVersion, WaterfallStructure, WaterfallTier,
} from '@/types/equity'

/**
 * Offerings.
 *
 * An offering is a securities offering, so two rules run through this file.
 *
 * First, the platform never decides that an offering is lawful. It records
 * what a sponsor asserts, runs a completeness check, and routes it to a human
 * reviewer. Publication is an administrator's act.
 *
 * Second, terms an investor has seen are never edited in place. A change
 * writes a version, and where the change is material the offering's investors
 * are asked to acknowledge the disclosures again.
 */

/** Offering types that a feature flag must permit before they can be created. */
const FLAGGED_TYPES: Partial<Record<OfferingType, 'REG_CF_ENABLED' | 'REG_D_ENABLED'>> = {
  reg_cf: 'REG_CF_ENABLED',
  reg_d_506b: 'REG_D_ENABLED',
  reg_d_506c: 'REG_D_ENABLED',
}

export interface OfferingInput {
  name: string
  offering_type: OfferingType
  legal_structure?: string | null
  issuer_entity?: string | null
  summary?: string | null
  target_raise?: number | null
  minimum_investment?: number | null
  maximum_investment?: number | null
  offering_start_date?: string | null
  offering_end_date?: string | null
  target_close_date?: string | null
  terms?: Partial<OfferingTerms>
  eligibility?: Partial<OfferingEligibility>
}

async function nextReference(): Promise<string> {
  const store = await db()
  const count = await store.count('offerings')
  return `OFF-${1001 + count}`
}

export async function createOffering(
  actor: Actor,
  dealId: string,
  input: OfferingInput,
): Promise<Offering> {
  authorize(isAvailable('EQUITY_MARKETPLACE_ENABLED'), 'The equity marketplace is not enabled.')
  const flag = FLAGGED_TYPES[input.offering_type]
  if (flag) {
    authorize(isAvailable(flag), `${input.offering_type} offerings are not enabled for this deployment.`)
  }

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(
    deal.company_id === actor.company.id || actor.isAdmin,
    'You can only raise equity on your own deal.',
  )
  authorize(actor.canWrite, 'You do not have permission to create an offering.')

  const offering = await store.insert('offerings', {
    deal_id: dealId,
    company_id: deal.company_id,
    name: input.name,
    reference: await nextReference(),
    offering_type: input.offering_type,
    legal_structure: input.legal_structure ?? null,
    issuer_entity: input.issuer_entity ?? null,
    summary: input.summary ?? null,
    target_raise: input.target_raise ?? null,
    minimum_investment: input.minimum_investment ?? null,
    maximum_investment: input.maximum_investment ?? null,
    committed_amount: 0,
    offering_start_date: input.offering_start_date ?? null,
    offering_end_date: input.offering_end_date ?? null,
    target_close_date: input.target_close_date ?? null,
    status: 'draft',
    disclosure_status: 'incomplete',
    compliance_status: 'not_started',
    published_at: null,
    published_by: null,
    closed_at: null,
    created_by: actor.user.id,
  } as Omit<Offering, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('offering_terms', {
    offering_id: offering.id,
    capital_position: input.terms?.capital_position ?? 'common_equity',
    target_hold_months: input.terms?.target_hold_months ?? null,
    preferred_return_pct: input.terms?.preferred_return_pct ?? null,
    target_irr_pct: input.terms?.target_irr_pct ?? null,
    target_equity_multiple: input.terms?.target_equity_multiple ?? null,
    target_cash_on_cash_pct: input.terms?.target_cash_on_cash_pct ?? null,
    sponsor_promote_pct: input.terms?.sponsor_promote_pct ?? null,
    distribution_frequency: input.terms?.distribution_frequency ?? 'quarterly',
    acquisition_fee_pct: input.terms?.acquisition_fee_pct ?? null,
    asset_management_fee_pct: input.terms?.asset_management_fee_pct ?? null,
    disposition_fee_pct: input.terms?.disposition_fee_pct ?? null,
    assumptions: input.terms?.assumptions ?? {
      hold_years: null, exit_cap_rate_pct: null, exit_multiple_of_ebitda: null,
      revenue_growth_pct: null, expense_growth_pct: null, occupancy_stabilized_pct: null,
      capex_per_bed: null, selling_costs_pct: null, notes: null,
    },
  } as Omit<OfferingTerms, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('offering_eligibility', {
    offering_id: offering.id,
    accredited_required: input.eligibility?.accredited_required ?? true,
    verification_required: input.eligibility?.verification_required ?? true,
    excluded_states: input.eligibility?.excluded_states ?? [],
    permitted_states: input.eligibility?.permitted_states ?? [],
    entity_types_permitted: input.eligibility?.entity_types_permitted ?? [],
    minimum_net_worth: input.eligibility?.minimum_net_worth ?? null,
    minimum_income: input.eligibility?.minimum_income ?? null,
    investment_limit: input.eligibility?.investment_limit ?? null,
    verification_provider: input.eligibility?.verification_provider ?? null,
    transaction_provider: input.eligibility?.transaction_provider ?? null,
    broker_dealer: input.eligibility?.broker_dealer ?? null,
    funding_portal: input.eligibility?.funding_portal ?? null,
    custodian: input.eligibility?.custodian ?? null,
    transfer_agent: input.eligibility?.transfer_agent ?? null,
    required_acknowledgements: input.eligibility?.required_acknowledgements ?? [],
  } as Omit<OfferingEligibility, 'id' | 'created_at' | 'updated_at'>)

  await seedStandardDisclosures(offering.id)
  await seedWaterfall(offering.id, input.terms?.sponsor_promote_pct ?? 0.2)

  await recordAudit({
    actor, action: 'offering.created', entityType: 'offering', entityId: offering.id,
    dealId, summary: `${actor.user.full_name} created offering ${offering.reference}.`,
  })
  return offering
}

export async function updateOffering(
  actor: Actor,
  offeringId: string,
  patch: Partial<Offering>,
  termsPatch?: Partial<OfferingTerms>,
): Promise<Offering> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    canEditOffering(subjectOf(actor), offering),
    'This offering can no longer be edited directly. Publish a new version instead.',
  )

  const { id: _id, deal_id: _deal, company_id: _company, reference: _ref, status: _status,
    published_at: _pub, published_by: _by, committed_amount: _committed, ...safe } = patch
  const updated = await store.update('offerings', offeringId, safe)

  if (termsPatch) {
    const terms = await store.selectOne('offering_terms', { where: { offering_id: offeringId } })
    if (terms) {
      const { id: _tid, offering_id: _oid, ...safeTerms } = termsPatch
      await store.update('offering_terms', terms.id, safeTerms)
    }
  }

  await recordAudit({
    actor, action: 'offering.updated', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `${actor.user.full_name} updated offering ${offering.reference}.`,
  })
  return updated
}

// ---------------------------------------------------------------------------
// Quality check
// ---------------------------------------------------------------------------

/**
 * Checks an offering for the problems that should stop it reaching investors.
 *
 * Entirely deterministic: every finding points at a specific absent or
 * inconsistent figure. A language model is asked for a qualitative read
 * elsewhere, but it has no vote here, because a blocker that appears or
 * vanishes between runs is not a control.
 *
 * The verdict never publishes anything. A human decides.
 */
export async function checkOfferingQuality(offeringId: string): Promise<{
  verdict: 'pass' | 'warnings' | 'blockers'
  findings: ComplianceFinding[]
}> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  const [terms, eligibility, disclosures, documents, snapshot] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    store.selectOne('offering_eligibility', { where: { offering_id: offeringId } }),
    store.select('offering_disclosures', { where: { offering_id: offeringId } }),
    store.select('offering_documents', { where: { offering_id: offeringId } }),
    buildSnapshot(offering.deal_id),
  ])

  const findings: ComplianceFinding[] = []
  const blocker = (code: string, title: string, detail: string) =>
    findings.push({ severity: 'blocker', code, title, detail })
  const warn = (code: string, title: string, detail: string) =>
    findings.push({ severity: 'warning', code, title, detail })

  // --- the raise itself -----------------------------------------------------
  if (!offering.target_raise || offering.target_raise <= 0) {
    blocker('target_raise', 'No target raise', 'An offering must state how much it is raising.')
  }
  if (!offering.minimum_investment || offering.minimum_investment <= 0) {
    blocker('minimum', 'No minimum investment', 'An offering must state its minimum investment.')
  }
  if (offering.target_raise && offering.minimum_investment
    && offering.minimum_investment > offering.target_raise) {
    blocker('minimum_exceeds_raise', 'Minimum exceeds the raise',
      'The minimum investment is larger than the entire target raise.')
  }
  if (offering.maximum_investment && offering.minimum_investment
    && offering.maximum_investment < offering.minimum_investment) {
    blocker('max_below_min', 'Maximum below minimum',
      'The maximum investment is smaller than the minimum.')
  }
  if (!offering.issuer_entity) {
    blocker('issuer', 'No issuer named', 'Investors must be told which entity is issuing the securities.')
  }

  // --- projections must be supportable -------------------------------------
  const assumptions = terms?.assumptions
  if (!assumptions?.hold_years) {
    blocker('hold', 'No hold period', 'Returns cannot be projected without a stated hold period.')
  }
  if (!assumptions?.exit_cap_rate_pct && !assumptions?.exit_multiple_of_ebitda) {
    blocker('exit', 'No exit assumption',
      'Projected returns depend on an exit assumption, and none has been stated.')
  }
  if (terms?.target_irr_pct && !assumptions?.hold_years) {
    blocker('irr_without_hold', 'Target return without a hold period',
      'A target internal rate of return is quoted but no hold period supports it.')
  }
  if (terms?.target_irr_pct && terms.target_irr_pct > 40) {
    warn('irr_high', 'Unusually high target return',
      `A ${terms.target_irr_pct}% target return is far above the range typical of stabilised healthcare real estate. Expect it to be questioned.`)
  }
  if (terms?.preferred_return_pct && terms.preferred_return_pct > 0.15) {
    warn('pref_high', 'Unusually high preferred return',
      'A preferred return above 15% is uncommon and may indicate a mis-entered rate.')
  }

  // --- the deal underneath --------------------------------------------------
  if (!snapshot) {
    blocker('deal', 'Deal not found', 'The deal behind this offering could not be loaded.')
  } else {
    if (snapshot.summary.noi === null) {
      blocker('noi', 'No underwritten income',
        'The deal has no underwritten net operating income, so no projection can be produced.')
    }
    if (offering.target_raise && snapshot.summary.equityRequirement !== null) {
      const gap = Math.abs(offering.target_raise - snapshot.summary.equityRequirement)
      if (gap > snapshot.summary.equityRequirement * 0.25) {
        warn('raise_mismatch', 'Raise does not match the equity requirement',
          `The offering raises ${money(offering.target_raise)} but the deal's capital gap is ${money(snapshot.summary.equityRequirement)}.`)
      }
    }
    const openDiscrepancies = await store.count('discrepancies', {
      where: { deal_id: offering.deal_id, status: 'open' },
    })
    if (openDiscrepancies > 0) {
      warn('discrepancies', 'Unresolved contradictions in the source documents',
        `${openDiscrepancies} discrepancy${openDiscrepancies === 1 ? '' : 'ies'} between documents on this deal remain unresolved.`)
    }
  }

  // --- disclosure and documents --------------------------------------------
  const required = disclosures.filter((d) => d.required)
  if (required.length === 0) {
    blocker('disclosures', 'No risk disclosures',
      'An offering cannot be published without risk disclosures for investors to acknowledge.')
  }
  if (documents.length === 0) {
    warn('documents', 'No documents published',
      'No offering documents have been published to the investor data room.')
  }
  const hasSubscription = documents.some((d) => d.category === 'subscription_agreement')
  if (!hasSubscription) {
    warn('subscription', 'No subscription agreement',
      'Investors are usually shown the subscription agreement before committing.')
  }

  // --- who may invest -------------------------------------------------------
  if (!eligibility) {
    blocker('eligibility', 'No eligibility configuration',
      'The offering has no investor eligibility rules, so nobody can be checked against it.')
  } else if (!eligibility.accredited_required && offering.offering_type.startsWith('reg_d')) {
    warn('reg_d_accreditation', 'Regulation D offering open to non-accredited investors',
      'This is configured as a Regulation D offering but does not require accredited status. Confirm this with counsel.')
  }

  const verdict = findings.some((f) => f.severity === 'blocker')
    ? 'blockers'
    : findings.some((f) => f.severity === 'warning') ? 'warnings' : 'pass'
  return { verdict, findings }
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ---------------------------------------------------------------------------
// Review and publication
// ---------------------------------------------------------------------------

/** Sponsor hands the offering to a reviewer. */
export async function submitForReview(actor: Actor, offeringId: string): Promise<Offering> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can submit this offering for review.',
  )
  const quality = await checkOfferingQuality(offeringId)
  authorize(
    quality.verdict !== 'blockers',
    'This offering still has blocking issues. Resolve them before submitting it for review.',
  )

  const updated = await store.update('offerings', offeringId, {
    status: 'compliance_review',
    compliance_status: 'in_review',
  } as Partial<Offering>)

  await store.insert('compliance_reviews', {
    offering_id: offeringId,
    status: 'in_review',
    automated_verdict: quality.verdict,
    findings: quality.findings,
    reviewer_notes: null,
    reviewed_by: null,
    reviewed_at: null,
  } as Omit<ComplianceReview, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'offering.submitted_for_review', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id,
    summary: `${offering.reference} submitted for compliance review (${quality.verdict}).`,
  })
  return updated
}

/**
 * Publishes an offering to the marketplace.
 *
 * Administrator only, and only over an offering whose blocking issues are
 * resolved. This is the moment an offering becomes visible to investors, so
 * it writes a version recording exactly what they will see.
 */
export async function publishOffering(actor: Actor, offeringId: string): Promise<Offering> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(canPublishOffering(subjectOf(actor)), 'Only an administrator can publish an offering.')

  const quality = await checkOfferingQuality(offeringId)
  authorize(
    quality.verdict !== 'blockers',
    'This offering has blocking issues and cannot be published.',
  )

  const now = new Date().toISOString()
  const updated = await store.update('offerings', offeringId, {
    status: 'live',
    compliance_status: 'cleared',
    disclosure_status: 'published',
    published_at: now,
    published_by: actor.user.id,
    offering_start_date: offering.offering_start_date ?? now,
  } as Partial<Offering>)

  await writeVersion(actor, offeringId, 'Offering published to the marketplace.', false)

  await recordAudit({
    actor, action: 'offering.published', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `${offering.reference} was published to the marketplace.`,
  })

  // Matching is recomputed against the new offering so it appears for the
  // investors whose stated preferences fit it.
  const { computeMatchesForOffering } = await import('./matching')
  await computeMatchesForOffering(offeringId)
  return updated
}

export async function setOfferingStatus(
  actor: Actor,
  offeringId: string,
  status: OfferingStatus,
  reason: string,
): Promise<Offering> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    canReviewOffering(subjectOf(actor)) || offering.company_id === actor.company.id,
    'You cannot change this offering’s status.',
  )
  // A sponsor may pause or close its own raise; only an administrator may make
  // one live, which publishOffering handles with its own checks.
  authorize(
    status !== 'live' || actor.isAdmin,
    'Only an administrator can make an offering live.',
  )
  const updated = await store.update('offerings', offeringId, {
    status,
    closed_at: status === 'closed' ? new Date().toISOString() : offering.closed_at,
  } as Partial<Offering>)

  // The platform's only revenue event. It is taken on capital that actually
  // funded rather than on the target or on what was merely committed, so a
  // raise that closes short is billed on what it raised and a raise that
  // closes empty is billed nothing.
  if (status === 'closed' && offering.status !== 'closed') {
    const funded = (await store.select('investment_commitments', {
      where: { offering_id: offeringId, status: { in: ['accepted', 'funded'] } },
    })).reduce((total, commitment) => total + commitment.amount, 0)
    await recordRaiseFee(offeringId, offering.company_id, offering.deal_id, funded)
  }

  await recordAudit({
    actor, action: 'offering.status_changed', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `${offering.reference} moved to ${status}: ${reason}`,
  })
  return updated
}

/**
 * Records a frozen snapshot of the offering's terms.
 *
 * A material change notifies everyone who has engaged with the offering and,
 * where configured, requires them to acknowledge the disclosures again — the
 * terms they agreed to are not the terms now on offer.
 */
export async function writeVersion(
  actor: Actor,
  offeringId: string,
  summary: string,
  material: boolean,
): Promise<OfferingVersion> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  const [terms, eligibility, existing] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    store.selectOne('offering_eligibility', { where: { offering_id: offeringId } }),
    store.select('offering_versions', { where: { offering_id: offeringId } }),
  ])

  const version = await store.insert('offering_versions', {
    offering_id: offeringId,
    version: existing.length + 1,
    summary,
    material_change: material,
    requires_reacknowledgement: material,
    snapshot: { offering, terms, eligibility },
    created_by: actor.user.id,
  } as Omit<OfferingVersion, 'id' | 'created_at'>)

  if (material) {
    const interests = await store.select('investment_interests', { where: { offering_id: offeringId } })
    for (const interest of interests) {
      const profile = await store.findById('investor_profiles', interest.investor_id)
      if (!profile) continue
      await notify({
        event: 'message.received',
        companyId: profile.company_id,
        title: `${offering.name}: terms have changed`,
        body: summary,
        href: `/investments/${offeringId}`,
        dealId: offering.deal_id,
      })
    }
  }
  return version
}

// ---------------------------------------------------------------------------

export async function requireOffering(offeringId: string): Promise<Offering> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) throw new Error('Offering not found.')
  return offering
}

/** Loads an offering an actor is entitled to see, or refuses. */
export async function readOffering(actor: Actor, offeringId: string): Promise<Offering> {
  const offering = await requireOffering(offeringId)
  authorize(canViewOffering(subjectOf(actor), offering), 'This offering is not available to you.')
  return offering
}

export async function offeringsForDeal(dealId: string): Promise<Offering[]> {
  const store = await db()
  return store.select('offerings', { where: { deal_id: dealId }, orderBy: { field: 'created_at' } })
}

/**
 * The disclosures every offering starts with.
 *
 * These are the risks inherent to this asset class, written plainly. A sponsor
 * adds to them; the platform does not let an offering ship without them.
 */
async function seedStandardDisclosures(offeringId: string): Promise<void> {
  const store = await db()
  const standard: Pick<OfferingDisclosure, 'key' | 'title' | 'body'>[] = [
    {
      key: 'illiquidity',
      title: 'This investment cannot be sold',
      body: 'There is no public market for these securities and none is expected to develop. You should be prepared to hold this investment for its full term, and to lose access to the capital for longer if the sponsor does not exit when planned.',
    },
    {
      key: 'loss_of_capital',
      title: 'You may lose your entire investment',
      body: 'Equity in a healthcare operating business ranks behind every lender and creditor. If the business underperforms or the asset sells for less than the debt against it, equity investors can and do receive nothing.',
    },
    {
      key: 'projections',
      title: 'Projections are not results',
      body: 'Every forward-looking figure shown for this offering is derived from assumptions the sponsor has stated. Assumptions are not facts, projections are not promises, and actual results will differ — potentially by a wide margin.',
    },
    {
      key: 'reimbursement',
      title: 'Revenue depends on government reimbursement',
      body: 'Skilled nursing revenue is set largely by Medicare and Medicaid. Those rates are decided politically, can be reduced with limited notice, and are outside the operator’s control.',
    },
    {
      key: 'operating_risk',
      title: 'Healthcare operations carry regulatory and staffing risk',
      body: 'Facilities are licensed and surveyed. Findings can result in fines, admission holds, or loss of licence. Labour shortages can force reliance on agency staffing at costs that materially erode margins.',
    },
    {
      key: 'no_advice',
      title: 'CareCapital does not advise you',
      body: 'CareCapital Exchange is not your broker, investment adviser, or fiduciary, and nothing on this platform is a recommendation to invest. Consider obtaining independent legal, tax and financial advice before committing capital.',
    },
  ]

  for (const disclosure of standard) {
    await store.insert('offering_disclosures', {
      offering_id: offeringId,
      key: disclosure.key,
      title: disclosure.title,
      body: disclosure.body,
      version: 1,
      required: true,
    } as Omit<OfferingDisclosure, 'id' | 'created_at' | 'updated_at'>)
  }
}

async function seedWaterfall(offeringId: string, promote: number): Promise<void> {
  const store = await db()
  const structure = await store.insert('waterfall_structures', {
    offering_id: offeringId,
    kind: 'preferred_return_promote',
    cumulative_preferred: true,
    has_catch_up: false,
    catch_up_pct: null,
  } as Omit<WaterfallStructure, 'id' | 'created_at' | 'updated_at'>)

  for (const tier of defaultTiers('preferred_return_promote', promote)) {
    await store.insert('waterfall_tiers', {
      waterfall_id: structure.id,
      ...tier,
    } as Omit<WaterfallTier, 'id' | 'created_at'>)
  }
}
