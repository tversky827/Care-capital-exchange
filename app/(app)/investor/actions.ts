'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/policy'
import {
  advanceOnboarding, createInvestorProfile, requestVerification, updateInvestorProfile,
  updatePreferences,
} from '@/services/equity/investors'
import type { ActionState } from '@/app/(app)/deals/actions'
import type {
  AssetType,
} from '@/types'
import type {
  CapitalPosition, InvestorType, OnboardingStage, VerificationKind,
} from '@/types/equity'

/** Investor onboarding and profile actions. */

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

export async function onboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const stage = String(formData.get('stage') ?? 'profile') as OnboardingStage
  try {
    const actor = await requireActor()

    if (stage === 'profile') {
      const displayName = String(formData.get('displayName') ?? '').trim()
      if (!displayName) return { error: 'Enter the name this account invests under.' }
      await createInvestorProfile(actor, {
        display_name: displayName,
        investor_type: String(formData.get('investorType') ?? 'individual') as InvestorType,
        state: String(formData.get('state') ?? '') || null,
      })
      revalidatePath('/investor/onboarding')
      return { success: 'Profile created.' }
    }

    if (stage === 'experience') {
      await updateInvestorProfile(actor, {
        years_investing: numberOrNull(formData.get('yearsInvesting')),
        prior_private_placements: numberOrNull(formData.get('priorPlacements')),
        healthcare_experience: formData.get('healthcareExperience') === 'on',
      })
    }

    if (stage === 'preferences') {
      await updatePreferences(actor, {
        investment_range: (String(formData.get('investmentRange') ?? '') || null) as never,
        typical_investment: numberOrNull(formData.get('typicalInvestment')),
        asset_types: formData.getAll('assetTypes').map(String) as AssetType[],
        states: String(formData.get('states') ?? '')
          .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        capital_positions: formData.getAll('capitalPositions').map(String) as CapitalPosition[],
      })
    }

    if (stage === 'risk') {
      await updatePreferences(actor, {
        risk_tolerance: (String(formData.get('riskTolerance') ?? '') || null) as never,
        return_preference: (String(formData.get('returnPreference') ?? '') || null) as never,
        target_return_min_pct: numberOrNull(formData.get('targetReturnMin')),
        target_return_max_pct: numberOrNull(formData.get('targetReturnMax')),
        min_hold_months: numberOrNull(formData.get('minHoldYears')) === null
          ? null : (numberOrNull(formData.get('minHoldYears')) ?? 0) * 12,
        max_hold_months: numberOrNull(formData.get('maxHoldYears')) === null
          ? null : (numberOrNull(formData.get('maxHoldYears')) ?? 0) * 12,
        max_leverage_pct: numberOrNull(formData.get('maxLeverage')) === null
          ? null : (numberOrNull(formData.get('maxLeverage')) ?? 0) / 100,
      })
    }

    if (stage === 'eligibility') {
      await updateInvestorProfile(actor, {
        self_certified_accredited: formData.get('accredited') === 'on',
        accreditation_basis: (String(formData.get('accreditationBasis') ?? '') || null) as never,
      })
    }

    if (stage === 'kyc') {
      // Identity, know-your-customer and screening run together: the providers
      // in this market bundle them, and the investor experiences one step.
      for (const kind of ['identity', 'kyc', 'aml'] as VerificationKind[]) {
        await requestVerification(actor, kind)
      }
    }

    if (stage === 'accreditation') {
      await requestVerification(actor, 'accreditation')
    }

    await advanceOnboarding(actor, stage)
    revalidatePath('/investor/onboarding')
    return { success: 'Saved.' }
  } catch (error) {
    return failure(error)
  }
}

export async function finishOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const stage = String(formData.get('stage') ?? 'account') as OnboardingStage
  try {
    const actor = await requireActor()
    await advanceOnboarding(actor, stage)
  } catch (error) {
    return failure(error)
  }
  redirect('/investor/dashboard')
}

export async function updatePreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    await updatePreferences(actor, {
      asset_types: formData.getAll('assetTypes').map(String) as AssetType[],
      states: String(formData.get('states') ?? '')
        .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      capital_positions: formData.getAll('capitalPositions').map(String) as CapitalPosition[],
      typical_investment: numberOrNull(formData.get('typicalInvestment')),
      target_return_min_pct: numberOrNull(formData.get('targetReturnMin')),
      risk_tolerance: (String(formData.get('riskTolerance') ?? '') || null) as never,
    })
    revalidatePath('/investor/profile')
    return { success: 'Preferences updated. Your matches have been recalculated.' }
  } catch (error) {
    return failure(error)
  }
}

export async function requestVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = String(formData.get('kind') ?? 'identity') as VerificationKind
  try {
    const actor = await requireActor()
    const result = await requestVerification(actor, kind)
    revalidatePath('/investor/profile')
    return { success: `${kind} verification: ${result.status}.` }
  } catch (error) {
    return failure(error)
  }
}
