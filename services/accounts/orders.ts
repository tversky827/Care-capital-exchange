import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { cents, format, type Cents } from '@/lib/money'
import { recordAudit } from '../audit'
import { requireOffering } from '../equity/offerings'
import { acknowledgeDisclosures, evaluateEligibility } from '../equity/commitments'
import { requireNda } from '../equity/nda'
import { accountFor, requireActiveAccount } from './accounts'
import { advance, post, spendableFor } from './ledger'
import { provider } from './providers'
import type { Actor } from '@/lib/auth/session'
import type { InvestmentOrder, OrderStatus } from '@/types/accounts'

/**
 * Investment orders.
 *
 * An order is an instruction to move a stated amount of an investor's own cash
 * into an offering. It is the durable record of what they asked for; the
 * position is what exists afterwards. Keeping the two apart is what lets an
 * order be rejected, cancelled or fail without leaving behind a position that
 * was never really taken — and lets an investor see where their money is while
 * it is neither in their cash balance nor yet in a holding.
 *
 * The cash is debited when the order is submitted, as a *pending* ledger entry.
 * That is deliberate. Reserving at submission means the same dollar cannot be
 * committed to two offerings while both are in flight; leaving the debit
 * pending rather than posted means it is visibly not yet spent, and a rejected
 * order releases it by cancelling the entry rather than by writing a refund
 * for money that never left.
 *
 * No state is skipped. An order that will settle still passes through
 * submitted and accepted, because "where is my money" deserves a better answer
 * than "processing", and because a history that records only outcomes cannot
 * be used to find out where things go wrong.
 */

/** Which states each state may move to. The whole machine, in one place. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['eligibility_check', 'cancelled'],
  eligibility_check: ['pending_confirmation', 'rejected', 'cancelled'],
  pending_confirmation: ['submitted', 'cancelled'],
  submitted: ['accepted', 'rejected', 'failed', 'cancelled'],
  accepted: ['settling', 'failed', 'cancelled'],
  settling: ['settled', 'failed'],
  settled: [],
  rejected: [],
  cancelled: [],
  failed: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

async function nextReference(): Promise<string> {
  const store = await db()
  return `ORD-${100_001 + (await store.count('investment_orders'))}`
}

async function requireOrder(orderId: string): Promise<InvestmentOrder> {
  const store = await db()
  const order = await store.findById('investment_orders', orderId)
  if (!order) throw new Error('Order not found.')
  return order
}

/** Moves an order, refusing anything the machine does not allow. */
async function move(
  order: InvestmentOrder,
  to: OrderStatus,
  patch: Partial<InvestmentOrder> = {},
): Promise<InvestmentOrder> {
  authorize(canTransition(order.status, to), `An order that is ${order.status} cannot become ${to}.`)
  const store = await db()
  return store.update('investment_orders', order.id, { status: to, ...patch } as Partial<InvestmentOrder>)
}

export interface PlaceOrderInput {
  offeringId: string
  amount: Cents
  /**
   * Unique per account. The same key never places a second order, which is
   * what makes a double-submitted form and a retried request safe.
   */
  idempotencyKey: string
}

/**
 * Creates an order and runs it up to the point a person has to confirm.
 *
 * Everything that can be checked before the investor commits is checked here:
 * the flags, the agreement, the account, the offering, the amount, the
 * eligibility and the cash. An order reaching `pending_confirmation` is one
 * that will go through unless something changes underneath it.
 */
export async function placeOrder(actor: Actor, input: PlaceOrderInput): Promise<InvestmentOrder> {
  authorize(isAvailable('INVESTMENT_ORDERS_ENABLED'), 'Investing is not enabled on this deployment.')
  const store = await db()
  const account = await requireActiveAccount(actor)

  const existing = await store.selectOne('investment_orders', {
    where: { account_id: account.id, idempotency_key: input.idempotencyKey },
  })
  if (existing) return existing

  const offering = await requireOffering(input.offeringId)
  // The detail of an offering is not shown without the agreement, and an order
  // is a stronger act than reading. Checked here as well as on the page.
  await requireNda(actor, input.offeringId)

  authorize(offering.status === 'live', 'This offering is not open for investment.')
  authorize(Boolean(actor.investor), 'Investing needs an investor account.')

  const amount = cents(input.amount)
  authorize(amount > 0, 'Enter the amount you want to invest.')

  const minimum = offering.minimum_investment
  authorize(
    minimum === null || amount >= minimum * 100,
    `The minimum investment in this offering is ${format(cents(Math.round((minimum ?? 0) * 100)))}.`,
  )
  const maximum = offering.maximum_investment
  authorize(
    maximum === null || amount <= maximum * 100,
    `The maximum investment in this offering is ${format(cents(Math.round((maximum ?? 0) * 100)))}.`,
  )

  const cash = await store.selectOne('cash_accounts', { where: { account_id: account.id } })
  if (!cash) throw new Error('This account has no cash account.')

  const order = await store.insert('investment_orders', {
    reference: await nextReference(),
    account_id: account.id,
    cash_account_id: cash.id,
    investor_id: actor.investor!.id,
    offering_id: offering.id,
    deal_id: offering.deal_id,
    amount_cents: amount,
    currency: 'USD',
    status: 'draft',
    eligibility_verdict: null,
    eligibility_detail: null,
    acknowledged_disclosures: [],
    ledger_entry_id: null,
    commitment_id: null,
    position_id: null,
    idempotency_key: input.idempotencyKey,
    provider: null,
    provider_order_ref: null,
    rejection_reason: null,
    failure_reason: null,
    submitted_at: null,
    accepted_at: null,
    settled_at: null,
  } as Omit<InvestmentOrder, 'id' | 'created_at' | 'updated_at'>)

  // --- eligibility ---------------------------------------------------------
  //
  // Everything except the disclosures, which are acknowledged inside the
  // ticket at the moment of confirmation — asking an investor to acknowledge
  // risks before they have been shown the amount, the fees and the terms would
  // be asking them to agree to something they have not seen. They are checked
  // again, in full, in `confirmOrder`.
  const checking = await move(order, 'eligibility_check')
  const eligibility = await evaluateEligibility(actor, offering.id)
  const blocking = eligibility.requirements.filter((r) => !r.satisfied && r.key !== 'disclosures')
  if (blocking.length > 0) {
    const summary = blocking[0]!.reason
    const rejected = await move(checking, 'rejected', {
      eligibility_verdict: eligibility.verdict,
      eligibility_detail: summary,
      rejection_reason: summary,
    })
    await recordAudit({
      actor, action: 'order.rejected', entityType: 'investment_order', entityId: order.id,
      dealId: offering.deal_id,
      summary: `${order.reference} was not eligible: ${summary}`,
    })
    return rejected
  }

  // --- the cash ------------------------------------------------------------
  const spendable = await spendableFor(account.id)
  authorize(
    spendable >= amount,
    `You have ${format(spendable)} available and this order is ${format(amount)}. Add funds or lower the amount.`,
  )

  return move(checking, 'pending_confirmation', {
    eligibility_verdict: eligibility.verdict,
    eligibility_detail: eligibility.summary,
  })
}

/**
 * Confirms an order: reserves the cash and hands it to the provider.
 *
 * The debit is written before the provider is called. If the provider fails,
 * the reservation is released; if the debit fails, no provider was ever asked
 * to do anything. The other order — call first, debit after — can leave a
 * transaction submitted with no money behind it.
 */
export async function confirmOrder(
  actor: Actor,
  orderId: string,
  acknowledgedDisclosures: string[] = [],
): Promise<InvestmentOrder> {
  const order = await requireOrder(orderId)
  const account = await requireActiveAccount(actor)
  authorize(order.account_id === account.id, 'That order belongs to another account.')
  authorize(
    order.status === 'pending_confirmation',
    'This order is not waiting for confirmation.',
  )

  const store = await db()
  const offering = await requireOffering(order.offering_id)

  // The disclosures are acknowledged here, as part of confirming, and then
  // eligibility is re-run in full. This is the last gate: everything checked
  // when the order was placed is checked again, because an account can be
  // suspended or an offering closed between the two.
  const required = (await store.select('offering_disclosures', {
    where: { offering_id: order.offering_id },
  })).filter((disclosure) => disclosure.required)

  if (required.length > 0) {
    const acknowledged = new Set(acknowledgedDisclosures)
    const missing = required.filter((disclosure) => !acknowledged.has(disclosure.id))
    authorize(
      missing.length === 0,
      'Acknowledge the risk disclosures before confirming this investment.',
    )
    await acknowledgeDisclosures(actor, order.offering_id, required.map((d) => d.id))
  }

  const eligibility = await evaluateEligibility(actor, order.offering_id)
  authorize(eligibility.verdict === 'eligible', eligibility.summary)
  // The verdict recorded on the order is the one that let it through, not the
  // provisional one from before the disclosures were acknowledged. It is kept
  // as evidence of what was true at the moment the investor committed.
  await store.update('investment_orders', order.id, {
    eligibility_verdict: eligibility.verdict,
    eligibility_detail: eligibility.summary,
  } as Partial<InvestmentOrder>)

  // Reserve the money. Pending rather than posted: it has left the investor's
  // spendable balance but has not been paid to anyone, and the statement
  // should say exactly that until it settles.
  const entry = await post({
    accountId: order.account_id,
    cashAccountId: order.cash_account_id,
    type: 'investment_debit',
    amount: cents(-order.amount_cents),
    description: `Investment in ${offering.name}`,
    idempotencyKey: `order:${order.id}`,
    status: 'pending',
    referenceType: 'order',
    referenceId: order.id,
  })

  const submitted = await move(order, 'submitted', {
    ledger_entry_id: entry.id,
    acknowledged_disclosures: acknowledgedDisclosures,
    submitted_at: new Date().toISOString(),
  })

  await recordAudit({
    actor, action: 'order.submitted', entityType: 'investment_order', entityId: order.id,
    dealId: order.deal_id,
    summary: `${order.reference}: ${format(cents(order.amount_cents))} into ${offering.name}.`,
    metadata: { amountCents: order.amount_cents, offeringId: offering.id },
  })

  // --- the provider --------------------------------------------------------
  const transactions = provider('investmentTransaction')
  const result = await transactions.submitOrder({
    accountRef: order.account_id,
    offeringRef: offering.id,
    amount: cents(order.amount_cents),
    idempotencyKey: `order:${order.id}`,
  }).catch((error: unknown) => ({
    ok: false,
    reference: '',
    status: 'failed',
    detail: error instanceof Error ? error.message : 'The provider could not be reached.',
  }))

  await store.insert('provider_transactions', {
    account_id: order.account_id,
    provider: transactions.name,
    provider_kind: 'broker_dealer',
    provider_ref: result.reference,
    kind: 'submit_order',
    amount_cents: order.amount_cents,
    status: result.status,
    reconciled: false,
    reconciled_at: null,
    payload: { orderId: order.id, offeringId: offering.id, detail: result.detail ?? null },
  } as never)

  if (!result.ok) {
    // Release the reservation. The money never left, so there is nothing to
    // refund — the entry is cancelled and drops out of the balance entirely.
    await advance(entry.id, 'cancelled')
    return move(submitted, 'failed', {
      failure_reason: result.detail ?? 'The transaction provider rejected this order.',
      provider: transactions.name,
    })
  }

  return move(submitted, 'accepted', {
    provider: transactions.name,
    provider_order_ref: result.reference,
    accepted_at: new Date().toISOString(),
  })
}

/**
 * Settles an accepted order into a position.
 *
 * This is the point the debit becomes real and the investor owns something.
 * In demo mode it is called immediately after acceptance; with a real provider
 * it is called when that provider confirms settlement, which can be days.
 */
export async function settleOrder(orderId: string): Promise<InvestmentOrder> {
  const order = await requireOrder(orderId)
  if (order.status === 'settled') return order
  const store = await db()
  const offering = await requireOffering(order.offering_id)

  const settling = await move(order, 'settling')

  // The debit posts: the money is now spent rather than reserved.
  if (order.ledger_entry_id) await advance(order.ledger_entry_id, 'posted')

  const interest = await store.selectOne('investment_interests', {
    where: { offering_id: order.offering_id, investor_id: order.investor_id },
  })

  const commitment = await store.insert('investment_commitments', {
    offering_id: order.offering_id,
    investor_id: order.investor_id,
    interest_id: interest?.id ?? null,
    amount: order.amount_cents / 100,
    status: 'accepted',
    acknowledged_disclosures: order.acknowledged_disclosures,
    submitted_at: order.submitted_at,
    accepted_at: new Date().toISOString(),
    accepted_by: null,
    rejected_reason: null,
  } as never)

  const targetRaise = offering.target_raise ?? 0
  const position = await store.insert('investment_positions', {
    offering_id: order.offering_id,
    investor_id: order.investor_id,
    deal_id: order.deal_id,
    invested_amount: order.amount_cents / 100,
    ownership_pct: targetRaise > 0 ? (order.amount_cents / 100) / targetRaise : null,
    capital_position: 'common_equity',
    // Held at cost until the sponsor reports a value. An estimate invented at
    // settlement would show a gain nobody earned.
    estimated_value: order.amount_cents / 100,
    estimated_value_at: new Date().toISOString(),
    distributions_received: 0,
    status: 'active',
    acquired_at: new Date().toISOString(),
    exited_at: null,
  } as never)

  // The offering's raised total is maintained from settled orders, never typed.
  await store.update('offerings', offering.id, {
    committed_amount: offering.committed_amount + order.amount_cents / 100,
  } as never)

  return move(settling, 'settled', {
    commitment_id: commitment.id,
    position_id: position.id,
    settled_at: new Date().toISOString(),
  })
}

/** Cancels an order that has not settled, releasing any reservation. */
export async function cancelOrder(actor: Actor, orderId: string, reason: string): Promise<InvestmentOrder> {
  const order = await requireOrder(orderId)
  const account = await accountFor(actor)
  authorize(
    actor.isAdmin || (account !== null && order.account_id === account.id),
    'That order belongs to another account.',
  )
  if (order.ledger_entry_id) {
    await advance(order.ledger_entry_id, 'cancelled').catch(() => undefined)
  }
  const cancelled = await move(order, 'cancelled', { failure_reason: reason })
  await recordAudit({
    actor, action: 'order.cancelled', entityType: 'investment_order', entityId: order.id,
    dealId: order.deal_id, summary: `${order.reference} was cancelled: ${reason}`,
  })
  return cancelled
}

/** Every order on an account, newest first. */
export async function ordersFor(accountId: string): Promise<InvestmentOrder[]> {
  const store = await db()
  return store.select('investment_orders', {
    where: { account_id: accountId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}
