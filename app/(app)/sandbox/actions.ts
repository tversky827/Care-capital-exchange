'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { format, parseAmount } from '@/lib/money'
import {
  currentEnvironment, enterEnvironment, leaveEnvironment, type SandboxEnvironment,
} from '@/lib/environment'
import {
  addCash, ensureAccount, record as recordActivity, resetAccount, withdrawCash, PracticeError,
} from '@/services/practice/accounts'
import { invest, simulateDistribution, simulateExit } from '@/services/practice/investing'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * The sandbox's server actions.
 *
 * Two rules hold across every one of them, and they are the reason the sandbox
 * is safe rather than merely labelled safe.
 *
 * The first: the environment is resolved from the signed cookie on every call,
 * never read from the form. A caller who posts `environment=live` is posting a
 * string that nothing reads. A caller who posts `environment=practice` while
 * holding no sandbox cookie is in `live`, and every function here refuses to
 * run there.
 *
 * The second: nothing in this file imports a production service. The functions
 * that could move real money, create an order or change an offering are not in
 * scope, so no argument makes one of them run.
 */

function failure(error: unknown): ActionState {
  if (error instanceof PracticeError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong.' }
}

/** The environment for this request, and a guarantee that it is a sandbox one. */
async function requireSandbox(): Promise<{ actor: Awaited<ReturnType<typeof requireActor>>; environment: SandboxEnvironment }> {
  const actor = await requireActor()
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') {
    throw new PracticeError('This action only exists inside the sandbox.')
  }
  return { actor, environment }
}

export async function enterSandboxAction(mode: SandboxEnvironment): Promise<void> {
  const actor = await requireActor()
  const flag = mode === 'demo' ? 'DEMO_MODE_ENABLED' : 'PRACTICE_MODE_ENABLED'
  if (!isAvailable(flag)) redirect('/sandbox')

  await enterEnvironment(mode, actor.user.id)
  await ensureAccount(actor, mode)
  redirect(mode === 'demo' ? '/sandbox/home' : '/sandbox/home')
}

export async function exitSandboxAction(): Promise<void> {
  await leaveEnvironment()
  redirect('/investor')
}

export async function addCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null || amount <= 0) return { error: 'Enter an amount to add.' }
  try {
    const { actor, environment } = await requireSandbox()
    await addCash(actor, environment, amount)
    revalidatePath('/sandbox', 'layout')
    return { success: 'Virtual cash added. No real money moved, and none could.' }
  } catch (error) {
    return failure(error)
  }
}

export async function withdrawCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null || amount <= 0) return { error: 'Enter an amount to take out.' }
  try {
    const { actor, environment } = await requireSandbox()
    await withdrawCash(actor, environment, amount)
    revalidatePath('/sandbox', 'layout')
    return { success: 'Virtual cash removed.' }
  } catch (error) {
    return failure(error)
  }
}

export async function practiceInvestAction(
  offeringId: string,
  rawAmount: string,
  idempotencyKey: string,
): Promise<{ positionId?: string; error?: string }> {
  const amount = parseAmount(rawAmount)
  if (amount === null || amount <= 0) return { error: 'Enter the amount you want to practise with.' }
  try {
    const { actor, environment } = await requireSandbox()
    const position = await invest(actor, environment, { offeringId, amount, idempotencyKey })
    revalidatePath('/sandbox', 'layout')
    revalidatePath(`/investments/${offeringId}`)
    return { positionId: position.id }
  } catch (error) {
    return failure(error) as { error: string }
  }
}

export async function simulateDistributionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const positionId = String(formData.get('positionId') ?? '')
  try {
    const { actor, environment } = await requireSandbox()
    const { amount, period } = await simulateDistribution(actor, environment, positionId)
    revalidatePath('/sandbox', 'layout')
    return {
      success:
        `Simulated quarter ${period}: ${format(amount)} paid out, worked through the offering's own waterfall.`,
    }
  } catch (error) {
    return failure(error)
  }
}

export async function simulateExitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const positionId = String(formData.get('positionId') ?? '')
  try {
    const { actor, environment } = await requireSandbox()
    await simulateExit(actor, environment, positionId)
    revalidatePath('/sandbox', 'layout')
    return { success: 'Simulated sale recorded. The proceeds are in your virtual cash.' }
  } catch (error) {
    return failure(error)
  }
}

export async function resetSandboxAction(): Promise<void> {
  const { actor, environment } = await requireSandbox()
  await resetAccount(actor, environment)
  revalidatePath('/sandbox', 'layout')
  redirect('/sandbox/home')
}

/**
 * Keeping a raise to come back to.
 *
 * The one thing in the sandbox a person may write freely: it holds no money
 * and nothing is derived from it. Still private — no operator is told that
 * somebody is watching them in a practice account, because that would turn the
 * sandbox into a channel for signalling interest and start eroding the promise
 * that nothing here creates an obligation.
 */
export async function toggleWatchAction(offeringId: string): Promise<{ watching: boolean; error?: string }> {
  try {
    const { actor, environment } = await requireSandbox()
    const account = await ensureAccount(actor, environment)
    const store = await db()

    const existing = await store.selectOne('practice_watchlist', {
      where: { account_id: account.id, offering_id: offeringId },
    })
    if (existing) {
      await store.remove('practice_watchlist', existing.id)
      await recordActivity(account, 'watchlist_removed', 'Removed a raise from the watchlist.', offeringId)
      revalidatePath('/sandbox', 'layout')
      return { watching: false }
    }

    await store.insert('practice_watchlist', {
      account_id: account.id, offering_id: offeringId, note: null,
    } as never)
    await recordActivity(account, 'watchlist_added', 'Added a raise to the watchlist.', offeringId)
    revalidatePath('/sandbox', 'layout')
    return { watching: true }
  } catch (error) {
    return { watching: false, ...(failure(error) as { error: string }) }
  }
}
