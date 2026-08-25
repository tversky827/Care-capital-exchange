'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/policy'
import {
  acknowledgeDisclosures, recordInterest, submitCommitment, withdrawInterest,
} from '@/services/equity/commitments'
import { askOffering, projectInvestment, runBearCase } from '@/services/equity/analysis'
import { askQuestion } from '@/services/equity/portfolio'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * Investor-facing server actions.
 *
 * Each one re-derives the actor from the session and lets the service layer
 * decide. Nothing trusts a value posted from the client except the content the
 * investor actually typed.
 */

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong.' }
}

export async function expressInterestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const raw = String(formData.get('indicatedAmount') ?? '').replace(/[^0-9.]/g, '')
  try {
    const actor = await requireActor()
    await recordInterest(actor, offeringId, {
      indicatedAmount: raw ? Number(raw) : null,
    })
    revalidatePath(`/investments/${offeringId}`)
    return { success: 'Your interest has been registered with the sponsor.' }
  } catch (error) {
    return failure(error)
  }
}

export async function withdrawInterestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  try {
    const actor = await requireActor()
    await withdrawInterest(actor, offeringId)
    revalidatePath(`/investments/${offeringId}`)
    return { success: 'Your interest has been withdrawn.' }
  } catch (error) {
    return failure(error)
  }
}

export async function acknowledgeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  try {
    const actor = await requireActor()
    const store = await db()
    const disclosures = await store.select('offering_disclosures', {
      where: { offering_id: offeringId },
    })
    const requestHeaders = await headers()
    await acknowledgeDisclosures(
      actor,
      offeringId,
      disclosures.filter((d) => d.required).map((d) => d.id),
      {
        // Recorded because an acknowledgement is evidentiary, not for tracking.
        ip: requestHeaders.get('x-forwarded-for'),
        userAgent: requestHeaders.get('user-agent'),
      },
    )
    revalidatePath(`/investments/${offeringId}`)
    return { success: 'Disclosures acknowledged.' }
  } catch (error) {
    return failure(error)
  }
}

export async function commitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const raw = String(formData.get('amount') ?? '').replace(/[^0-9.]/g, '')
  if (!raw) return { error: 'Enter the amount you intend to invest.' }
  try {
    const actor = await requireActor()
    await submitCommitment(actor, offeringId, Number(raw))
    revalidatePath(`/investments/${offeringId}`)
    return {
      success:
        'Your commitment has been recorded and sent to the sponsor. This is an indication of intent, not a completed securities transaction.',
    }
  } catch (error) {
    return failure(error)
  }
}

export async function askQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: 'Write your question first.' }
  try {
    const actor = await requireActor()
    await askQuestion(actor, offeringId, body)
    revalidatePath(`/investments/${offeringId}`)
    return { success: 'Your question has been sent to the sponsor.' }
  } catch (error) {
    return failure(error)
  }
}

/** The commitment calculator. Read-only: it computes, it does not commit. */
export async function calculateAction(
  offeringId: string,
  amount: number,
): Promise<Awaited<ReturnType<typeof projectInvestment>>> {
  await requireActor()
  return projectInvestment(offeringId, amount)
}

/** Runs the downside scenario for an offering. */
export async function bearCaseAction(offeringId: string) {
  await requireActor()
  return runBearCase(offeringId)
}

/** Answers an investor's question from the deal record, with citations. */
export async function askOfferingAction(offeringId: string, question: string) {
  await requireActor()
  const trimmed = question.trim().slice(0, 1000)
  if (!trimmed) return null
  return askOffering(offeringId, trimmed)
}
