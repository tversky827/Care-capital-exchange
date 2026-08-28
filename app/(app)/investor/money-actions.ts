'use server'

import { revalidatePath } from 'next/cache'
import { requireActor } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/policy'
import { parseAmount } from '@/lib/money'
import { deposit, withdraw } from '@/services/accounts/accounts'
import { cancelOrder, confirmOrder, placeOrder, settleOrder } from '@/services/accounts/orders'
import { isDemoMode } from '@/services/accounts/providers'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * The investor's money actions.
 *
 * Kept apart from `actions.ts`, which is onboarding and profile. Anything that
 * moves cash or places an order lives here, so the file that can spend money
 * is a short one and every export in it is worth reading twice.
 *
 * Every action re-derives the actor from the session and hands the decision to
 * the service layer. Amounts arrive as the string a person typed and are
 * parsed here rather than on the client: a client that can send `amount_cents`
 * directly is a client that can send any number it likes.
 */

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong.' }
}

export async function depositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null || amount <= 0) return { error: 'Enter an amount to add.' }
  try {
    const actor = await requireActor()
    await deposit(actor, amount)
    revalidatePath('/investor/cash')
    revalidatePath('/investor')
    return { success: isDemoMode() ? 'Added. No real money moved.' : 'Your deposit is on its way.' }
  } catch (error) {
    return failure(error)
  }
}

export async function withdrawAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null || amount <= 0) return { error: 'Enter an amount to withdraw.' }
  try {
    const actor = await requireActor()
    await withdraw(actor, amount)
    revalidatePath('/investor/cash')
    revalidatePath('/investor')
    return { success: 'Withdrawal requested.' }
  } catch (error) {
    return failure(error)
  }
}

/**
 * Opens the ticket: creates the order and runs everything that can be checked
 * before a person commits. Returns the order for the ticket to display.
 */
export async function placeOrderAction(
  offeringId: string,
  rawAmount: string,
  idempotencyKey: string,
): Promise<{ orderId?: string; status?: string; error?: string; detail?: string }> {
  const amount = parseAmount(rawAmount)
  if (amount === null || amount <= 0) return { error: 'Enter the amount you want to invest.' }
  try {
    const actor = await requireActor()
    const order = await placeOrder(actor, { offeringId, amount, idempotencyKey })
    return {
      orderId: order.id,
      status: order.status,
      detail: order.rejection_reason ?? order.eligibility_detail ?? undefined,
    }
  } catch (error) {
    return failure(error)
  }
}

/**
 * Confirms the ticket.
 *
 * In demo mode the order is settled immediately afterwards, because a demo
 * that leaves money in limbo cannot show the portfolio filling up. With a real
 * provider, settlement is that provider's callback days later and this stops
 * at accepted.
 */
export async function confirmOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  const disclosures = String(formData.get('disclosures') ?? '').split(',').filter(Boolean)
  try {
    const actor = await requireActor()
    const confirmed = await confirmOrder(actor, orderId, disclosures)
    if (isDemoMode() && confirmed.status === 'accepted') await settleOrder(confirmed.id)
    revalidatePath('/investor')
    revalidatePath('/investor/cash')
    revalidatePath('/investor/portfolio')
    revalidatePath('/investor/activity')
    return { success: 'Your investment has been placed.' }
  } catch (error) {
    return failure(error)
  }
}

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  try {
    const actor = await requireActor()
    await cancelOrder(actor, orderId, 'Cancelled by the investor.')
    revalidatePath('/investor/activity')
    return { success: 'Order cancelled.' }
  } catch (error) {
    return failure(error)
  }
}
