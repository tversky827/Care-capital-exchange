'use server'

import { revalidatePath } from 'next/cache'
import { requireActor } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/policy'
import { toggleSaved } from '@/services/equity/matching'
import type { ActionState } from '@/app/(app)/deals/actions'

/** Adds or removes an offering from the investor's watchlist. */
export async function toggleSavedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const offeringId = String(formData.get('offeringId') ?? '')
  try {
    const actor = await requireActor()
    const { saved } = await toggleSaved(actor, offeringId)
    revalidatePath('/investments')
    revalidatePath(`/investments/${offeringId}`)
    return { success: saved ? 'Added to your watchlist.' : 'Removed from your watchlist.' }
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: error.message }
    return { error: error instanceof Error ? error.message : 'Something went wrong.' }
  }
}
