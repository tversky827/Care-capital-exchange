import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canViewInvestorRecord, isInvestorSubject } from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { recordAudit } from '../audit'
import { getVerificationService } from './providers'
import type { Actor } from '@/lib/auth/session'
import type {
  InvestorPreferences, InvestorProfile, InvestorVerification, OnboardingStage,
  VerificationKind,
} from '@/types/equity'

/**
 * Investor accounts.
 *
 * An investor is a company of type `investor` with a profile attached, exactly
 * as a lender is a company with a lender record. That symmetry is deliberate:
 * authentication, membership, notifications and audit all keep working without
 * a second identity system.
 *
 * Nothing here stores an identity document, a social security number, a bank
 * account or a net-worth statement. Verification providers hold that material;
 * this service holds their verdicts.
 */

/** The onboarding steps, in the order the wizard walks them. */
export const ONBOARDING_STAGES: OnboardingStage[] = [
  'profile', 'experience', 'preferences', 'risk', 'eligibility',
  'kyc', 'accreditation', 'agreements', 'account', 'complete',
]

export function nextStage(stage: OnboardingStage): OnboardingStage {
  const index = ONBOARDING_STAGES.indexOf(stage)
  if (index === -1 || index === ONBOARDING_STAGES.length - 1) return 'complete'
  return ONBOARDING_STAGES[index + 1]
}

export function stageNumber(stage: OnboardingStage): number {
  const index = ONBOARDING_STAGES.indexOf(stage)
  return index === -1 ? 1 : index + 1
}

export async function getInvestorProfile(companyId: string): Promise<InvestorProfile | null> {
  const store = await db()
  return store.selectOne('investor_profiles', { where: { company_id: companyId } })
}

/** Creates the profile that turns an investor company into a marketplace participant. */
export async function createInvestorProfile(
  actor: Actor,
  input: Pick<InvestorProfile, 'display_name' | 'investor_type'> & Partial<InvestorProfile>,
): Promise<InvestorProfile> {
  authorize(isAvailable('INVESTOR_ONBOARDING_ENABLED'), 'Investor onboarding is not enabled.')
  const store = await db()
  const existing = await getInvestorProfile(actor.company.id)
  if (existing) return existing

  const profile = await store.insert('investor_profiles', {
    company_id: actor.company.id,
    display_name: input.display_name,
    investor_type: input.investor_type,
    state: input.state ?? null,
    country: input.country ?? 'US',
    years_investing: input.years_investing ?? null,
    healthcare_experience: input.healthcare_experience ?? false,
    prior_private_placements: input.prior_private_placements ?? null,
    self_certified_accredited: input.self_certified_accredited ?? false,
    accreditation_basis: input.accreditation_basis ?? null,
    onboarding_stage: 'experience',
    onboarding_completed_at: null,
    status: 'active',
  } as Omit<InvestorProfile, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('investor_preferences', {
    investor_id: profile.id,
    investment_range: null,
    typical_investment: null,
    asset_types: [],
    states: [],
    min_hold_months: null,
    max_hold_months: null,
    max_leverage_pct: null,
    risk_tolerance: null,
    target_return_min_pct: null,
    target_return_max_pct: null,
    return_preference: null,
    capital_positions: [],
  } as Omit<InvestorPreferences, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investor.profile_created', entityType: 'investor_profile', entityId: profile.id,
    summary: `${profile.display_name} created an investor profile.`,
  })
  return profile
}

export async function updateInvestorProfile(
  actor: Actor,
  patch: Partial<InvestorProfile>,
): Promise<InvestorProfile> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  // The stage is advanced by advanceOnboarding, never written directly, so a
  // form cannot skip a step by posting a later stage.
  const { onboarding_stage: _stage, onboarding_completed_at: _done, id: _id, company_id: _company, ...safe } = patch
  const updated = await store.update('investor_profiles', profile.id, safe)
  await recordAudit({
    actor, action: 'investor.profile_updated', entityType: 'investor_profile', entityId: profile.id,
    summary: `${updated.display_name} updated their investor profile.`,
  })
  return updated
}

export async function getPreferences(investorId: string): Promise<InvestorPreferences | null> {
  const store = await db()
  return store.selectOne('investor_preferences', { where: { investor_id: investorId } })
}

export async function updatePreferences(
  actor: Actor,
  patch: Partial<InvestorPreferences>,
): Promise<InvestorPreferences> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const existing = await getPreferences(profile.id)
  if (!existing) throw new Error('Investor preferences are missing.')
  const { id: _id, investor_id: _investor, ...safe } = patch
  const updated = await store.update('investor_preferences', existing.id, safe)
  await recordAudit({
    actor, action: 'investor.preferences_updated', entityType: 'investor_profile', entityId: profile.id,
    summary: `${profile.display_name} updated their investment preferences.`,
  })
  // Preferences drive matching, so the investor's matches are now stale.
  const { invalidateMatchesFor } = await import('./matching')
  await invalidateMatchesFor(profile.id)
  return updated
}

/**
 * Advances onboarding one step.
 *
 * The stage only ever moves forward through this function, so a client cannot
 * jump to "complete" by posting it. Completing the final step is what makes an
 * investor eligible to be checked against an offering at all.
 */
export async function advanceOnboarding(
  actor: Actor,
  from: OnboardingStage,
): Promise<InvestorProfile> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  if (profile.onboarding_stage !== from) {
    // Someone re-submitted a step they had already passed. Not an error worth
    // failing on; return the profile as it stands.
    return profile
  }
  const next = nextStage(from)
  const updated = await store.update('investor_profiles', profile.id, {
    onboarding_stage: next,
    onboarding_completed_at: next === 'complete' ? new Date().toISOString() : null,
  } as Partial<InvestorProfile>)

  if (next === 'complete') {
    await recordAudit({
      actor, action: 'investor.onboarding_completed', entityType: 'investor_profile', entityId: profile.id,
      summary: `${profile.display_name} completed investor onboarding.`,
    })
  }
  return updated
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export async function getVerifications(investorId: string): Promise<InvestorVerification[]> {
  const store = await db()
  return store.select('investor_verifications', { where: { investor_id: investorId } })
}

/**
 * Asks the configured provider to run a check and records what it says.
 *
 * The verdict is the provider's, never this platform's. An adapter that cannot
 * reach its provider leaves the check pending rather than passing it.
 */
export async function requestVerification(
  actor: Actor,
  kind: VerificationKind,
): Promise<InvestorVerification> {
  const profile = await requireOwnProfile(actor)
  if (kind === 'accreditation') {
    authorize(
      isAvailable('ACCREDITED_INVESTOR_VERIFICATION_ENABLED'),
      'Accreditation verification is not enabled for this deployment.',
    )
  }
  const store = await db()
  const service = getVerificationService()
  const outcome = await service.start({
    investorId: profile.id, kind, reference: `${profile.id}:${kind}`,
  })

  const existing = await store.selectOne('investor_verifications', {
    where: { investor_id: profile.id, kind },
  })

  const row = {
    investor_id: profile.id,
    kind,
    status: outcome.status,
    provider: outcome.provider,
    provider_reference: outcome.providerReference,
    detail: outcome.detail,
    verified_at: outcome.verifiedAt,
    expires_at: outcome.expiresAt,
  }

  const saved = existing
    ? await store.update('investor_verifications', existing.id, row as Partial<InvestorVerification>)
    : await store.insert('investor_verifications', row as Omit<InvestorVerification, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investor.verification_requested', entityType: 'investor_profile', entityId: profile.id,
    summary: `${kind} verification returned ${outcome.status} from ${outcome.provider}.`,
  })
  return saved
}

/**
 * Records a verification verdict an administrator reached outside the product
 * — the accreditation review a compliance team does by hand, for instance.
 */
export async function setVerificationStatus(
  actor: Actor,
  investorId: string,
  kind: VerificationKind,
  status: InvestorVerification['status'],
  detail: string | null,
): Promise<InvestorVerification> {
  authorize(actor.isAdmin, 'Only an administrator can record a verification decision.')
  const store = await db()
  const existing = await store.selectOne('investor_verifications', {
    where: { investor_id: investorId, kind },
  })
  const now = new Date().toISOString()
  const row = {
    investor_id: investorId,
    kind,
    status,
    provider: 'manual-review',
    provider_reference: null,
    detail,
    verified_at: status === 'verified' ? now : null,
    expires_at: null,
  }
  const saved = existing
    ? await store.update('investor_verifications', existing.id, row as Partial<InvestorVerification>)
    : await store.insert('investor_verifications', row as Omit<InvestorVerification, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investor.verification_decided', entityType: 'investor_profile', entityId: investorId,
    summary: `An administrator recorded ${kind} as ${status}.`,
  })
  return saved
}

// ---------------------------------------------------------------------------

/** The acting investor's own profile, or a refusal. */
export async function requireOwnProfile(actor: Actor): Promise<InvestorProfile> {
  authorize(isInvestorSubject(subjectOf(actor)), 'This area is for investor accounts.')
  const profile = actor.investor
  if (!profile) throw new Error('Investor profile not found.')
  return profile
}

/** Reads another investor's record, which only an administrator may do. */
export async function readInvestorRecord(
  actor: Actor,
  investorId: string,
): Promise<InvestorProfile> {
  const store = await db()
  const profile = await store.findById('investor_profiles', investorId)
  if (!profile) throw new Error('Investor not found.')
  authorize(
    canViewInvestorRecord(subjectOf(actor), { investor_id: profile.id }),
    'You cannot view another investor’s record.',
  )
  return profile
}
