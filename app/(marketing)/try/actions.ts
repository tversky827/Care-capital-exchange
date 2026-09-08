'use server'

import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { createGuest, establishSession, GuestLimitReached, isGuest } from '@/services/auth'
import { enterEnvironment } from '@/lib/environment'
import { ensureAccount } from '@/services/practice/accounts'

/**
 * The way in without an account.
 *
 * Makes a guest, signs it in, puts it in the demonstration and sends it to the
 * sandbox home. One press, no form, nothing to remember.
 *
 * A visitor who is already signed in keeps the account they have. Quietly
 * replacing somebody's session with a guest because they clicked the wrong
 * button would lose whatever they were doing.
 */
export async function startDemoAction(): Promise<{ error?: string }> {
  if (!isAvailable('DEMO_MODE_ENABLED') || !isAvailable('GUEST_DEMO_ENABLED')) {
    return { error: 'The demonstration is not open on this deployment.' }
  }

  const existing = await getActor()
  if (existing) {
    // Already somebody. Send them through the ordinary door.
    if (isGuest(existing)) {
      await enterEnvironment('demo', existing.user.id)
      await ensureAccount(existing, 'demo')
      redirect('/sandbox/home')
    }
    redirect('/sandbox')
  }

  let userId: string
  try {
    const { actor, token } = await createGuest()
    await establishSession(token)
    await enterEnvironment('demo', actor.user.id)
    await ensureAccount(actor, 'demo')
    userId = actor.user.id
  } catch (error) {
    if (error instanceof GuestLimitReached) return { error: error.message }
    return { error: 'The demonstration could not be started. Try again in a moment.' }
  }

  void userId
  redirect('/sandbox/home')
}
