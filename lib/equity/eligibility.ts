import type {
  InvestorProfile, InvestorVerification, Offering, OfferingEligibility, VerificationStatus,
} from '@/types/equity'

/**
 * Investment eligibility.
 *
 * The single gate between an investor and an offering. Nothing in the product
 * may advance an investor past a check this module has not cleared — not the
 * UI, not a server action, not a URL. Callers ask; they do not decide.
 *
 * The verdicts are deliberately few and blunt. "Needs information" means the
 * investor can fix it themselves; "pending" means someone else is working on
 * it; "not eligible" means this offering is closed to them and no amount of
 * clicking will change that.
 */

export type EligibilityVerdict = 'eligible' | 'not_eligible' | 'pending' | 'needs_information'

export interface EligibilityRequirement {
  key: string
  /** What is needed, in the investor's own terms. */
  label: string
  /** Why the offering requires it. Never legal advice — a statement of fact. */
  reason: string
  /** What the investor should do about it, or null when it is out of their hands. */
  action: string | null
  satisfied: boolean
  blocking: boolean
}

export interface EligibilityResult {
  verdict: EligibilityVerdict
  requirements: EligibilityRequirement[]
  /** The ceiling this offering places on this investor, when it places one. */
  maximumInvestment: number | null
  minimumInvestment: number | null
  /** A single sentence suitable for a banner. */
  summary: string
}

export interface EligibilityContext {
  offering: Pick<Offering, 'id' | 'status' | 'minimum_investment' | 'maximum_investment'>
  eligibility: OfferingEligibility | null
  investor: InvestorProfile
  verifications: InvestorVerification[]
  /** Everything the investor has already committed to this offering. */
  committedToDate: number
  /** Whether every required disclosure has been acknowledged at its current version. */
  disclosuresAcknowledged: boolean
}

function verificationFor(
  verifications: InvestorVerification[],
  kind: InvestorVerification['kind'],
): VerificationStatus {
  return verifications.find((v) => v.kind === kind)?.status ?? 'not_verified'
}

/** A verification that has lapsed is not a verification. */
function isCurrent(status: VerificationStatus): boolean {
  return status === 'verified'
}

/**
 * Decides whether an investor may proceed with an offering, and what is
 * missing when they may not.
 */
export function checkEligibility(context: EligibilityContext): EligibilityResult {
  const { offering, eligibility, investor, verifications } = context
  const requirements: EligibilityRequirement[] = []

  const add = (r: EligibilityRequirement) => requirements.push(r)

  // --- the offering itself must be open ------------------------------------
  const offeringOpen = offering.status === 'live'
  add({
    key: 'offering_open',
    label: 'The offering is open',
    reason: 'Commitments can only be made while an offering is accepting them.',
    action: null,
    satisfied: offeringOpen,
    blocking: true,
  })

  // --- the investor's own account ------------------------------------------
  add({
    key: 'account_active',
    label: 'Your investor account is in good standing',
    reason: 'A suspended or closed account cannot participate in an offering.',
    action: investor.status === 'active' ? null : 'Contact support to restore your account.',
    satisfied: investor.status === 'active',
    blocking: true,
  })

  add({
    key: 'onboarding_complete',
    label: 'Your investor profile is complete',
    reason: 'Offerings are matched and checked against the profile you provide.',
    action: investor.onboarding_stage === 'complete' ? null : 'Finish investor onboarding.',
    satisfied: investor.onboarding_stage === 'complete',
    blocking: true,
  })

  // --- identity, anti-money-laundering, accreditation ----------------------
  const identity = verificationFor(verifications, 'identity')
  const kyc = verificationFor(verifications, 'kyc')
  const aml = verificationFor(verifications, 'aml')
  const accreditation = verificationFor(verifications, 'accreditation')

  const verificationRequired = eligibility?.verification_required ?? true
  if (verificationRequired) {
    add({
      key: 'identity',
      label: 'Identity verified',
      reason: 'The offering requires verified identity before a commitment is accepted.',
      action: isCurrent(identity) ? null : 'Complete identity verification.',
      satisfied: isCurrent(identity),
      blocking: true,
    })
    add({
      key: 'kyc',
      label: 'Know-your-customer check passed',
      reason: 'Required of every investor before participating in a private offering.',
      action: isCurrent(kyc) ? null : 'Complete the know-your-customer check.',
      satisfied: isCurrent(kyc),
      blocking: true,
    })
    add({
      key: 'aml',
      label: 'Anti-money-laundering screening passed',
      reason: 'Screening is performed by an external provider before funds are accepted.',
      action: isCurrent(aml) ? null : null,
      satisfied: isCurrent(aml),
      blocking: true,
    })
  }

  if (eligibility?.accredited_required ?? true) {
    add({
      key: 'accreditation',
      label: 'Accredited investor status verified',
      reason: 'This offering is limited to accredited investors.',
      action: isCurrent(accreditation) ? null : 'Complete accreditation verification.',
      satisfied: isCurrent(accreditation),
      blocking: true,
    })
  }

  // --- where the investor is ------------------------------------------------
  const state = investor.state
  if (eligibility && state) {
    if (eligibility.excluded_states.includes(state)) {
      add({
        key: 'geography',
        label: 'Your state is eligible for this offering',
        reason: `This offering is not available to residents of ${state}.`,
        action: null,
        satisfied: false,
        blocking: true,
      })
    } else if (eligibility.permitted_states.length > 0 && !eligibility.permitted_states.includes(state)) {
      add({
        key: 'geography',
        label: 'Your state is eligible for this offering',
        reason: `This offering is limited to residents of ${eligibility.permitted_states.join(', ')}.`,
        action: null,
        satisfied: false,
        blocking: true,
      })
    }
  }

  // --- what kind of investor the offering accepts --------------------------
  if (eligibility && eligibility.entity_types_permitted.length > 0) {
    const permitted = eligibility.entity_types_permitted.includes(investor.investor_type)
    add({
      key: 'entity_type',
      label: 'Your investor type is eligible',
      reason: `This offering accepts ${eligibility.entity_types_permitted.join(', ')} investors.`,
      action: null,
      satisfied: permitted,
      blocking: true,
    })
  }

  // --- disclosures ----------------------------------------------------------
  add({
    key: 'disclosures',
    label: 'Required disclosures acknowledged',
    reason: 'Each offering requires its risk disclosures to be read and acknowledged.',
    action: context.disclosuresAcknowledged ? null : 'Review and acknowledge the offering disclosures.',
    satisfied: context.disclosuresAcknowledged,
    blocking: true,
  })

  // --- limits ---------------------------------------------------------------
  const limit = eligibility?.investment_limit ?? null
  const headroom = limit === null ? null : Math.max(0, limit - context.committedToDate)
  const maximumInvestment = [offering.maximum_investment, headroom]
    .filter((v): v is number => typeof v === 'number')
    .reduce<number | null>((lowest, v) => (lowest === null ? v : Math.min(lowest, v)), null)

  if (headroom !== null && headroom <= 0) {
    add({
      key: 'investment_limit',
      label: 'Investment limit not reached',
      reason: 'This offering places a per-investor ceiling on how much may be committed.',
      action: null,
      satisfied: false,
      blocking: true,
    })
  }

  // --- verdict --------------------------------------------------------------
  const unmet = requirements.filter((r) => !r.satisfied && r.blocking)
  const pendingKinds = [identity, kyc, aml, accreditation].filter((s) => s === 'pending')
  const actionable = unmet.filter((r) => r.action !== null)

  let verdict: EligibilityVerdict
  let summary: string
  if (unmet.length === 0) {
    verdict = 'eligible'
    summary = 'You meet this offering’s stated requirements.'
  } else if (actionable.length > 0) {
    verdict = 'needs_information'
    summary = `${actionable.length} step${actionable.length === 1 ? '' : 's'} remain before you can proceed.`
  } else if (pendingKinds.length > 0) {
    verdict = 'pending'
    summary = 'A verification is in progress. You will be notified when it completes.'
  } else {
    verdict = 'not_eligible'
    summary = unmet[0]?.reason ?? 'This offering is not open to you.'
  }

  return {
    verdict,
    requirements,
    maximumInvestment,
    minimumInvestment: offering.minimum_investment,
    summary,
  }
}

/**
 * Whether a specific amount may be committed.
 *
 * Separate from the eligibility check because it is asked at a different
 * moment: eligibility gates the door, this gates the number typed into it.
 */
export function checkAmount(
  amount: number,
  result: Pick<EligibilityResult, 'minimumInvestment' | 'maximumInvestment'>,
): { ok: boolean; error: string | null } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter the amount you intend to invest.' }
  }
  if (result.minimumInvestment !== null && amount < result.minimumInvestment) {
    return { ok: false, error: `The minimum investment in this offering is ${result.minimumInvestment.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.` }
  }
  if (result.maximumInvestment !== null && amount > result.maximumInvestment) {
    return { ok: false, error: `The most you may commit to this offering is ${result.maximumInvestment.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.` }
  }
  return { ok: true, error: null }
}
