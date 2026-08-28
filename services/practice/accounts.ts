import 'server-only'
import { db } from '@/db'
import { cents, format, type Cents } from '@/lib/money'
import { isAvailable } from '@/lib/flags'
import type { Actor } from '@/lib/auth/session'
import type { SandboxEnvironment } from '@/lib/environment'
import {
  MAX_VIRTUAL_BALANCE_CENTS, OPENING_BALANCE_CENTS,
  type PracticeAccount, type PracticeActivity, type PracticeActivityKind,
} from '@/types/practice'
import { balanceFor, post, PracticeLedgerError } from './ledger'

/**
 * The sandbox account.
 *
 * One per person per sandbox, opened on first entry, and holding virtual cash
 * that is the sum of its ledger. Nothing in this module touches an investor
 * account, a cash account, an order or a commitment; it does not import the
 * services that own them.
 */

export class PracticeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PracticeError'
  }
}

/**
 * Checks the environment is one of the two sandboxes, and that it is switched on.
 *
 * The name check is not redundant with the type. A caller that reached here
 * with `'live'` — through a cast, a JSON boundary, or a future refactor — used
 * to fall through to the practice branch, pass the practice flag, and then
 * fail deep inside the ledger on a missing opening balance. An unrecognised
 * environment is refused here, by name, where the error can say so.
 */
function requireEnabled(environment: SandboxEnvironment): void {
  if (environment !== 'demo' && environment !== 'practice') {
    throw new PracticeError('That is not a sandbox environment.')
  }
  const flag = environment === 'demo' ? 'DEMO_MODE_ENABLED' : 'PRACTICE_MODE_ENABLED'
  if (!isAvailable(flag)) {
    throw new PracticeError('That environment is not available on this deployment.')
  }
}

export async function accountFor(
  actor: Actor,
  environment: SandboxEnvironment,
): Promise<PracticeAccount | null> {
  const store = await db()
  return store.selectOne('practice_accounts', {
    where: { user_id: actor.user.id, environment, status: 'active' },
  })
}

/**
 * Finds the account, opening one on first entry.
 *
 * Opening credits the environment's starting balance as an `opening_balance`
 * entry rather than writing a number onto the account, so the first thing in
 * the history explains where the money came from.
 */
export async function ensureAccount(
  actor: Actor,
  environment: SandboxEnvironment,
): Promise<PracticeAccount> {
  requireEnabled(environment)
  const existing = await accountFor(actor, environment)
  if (existing) return existing

  const store = await db()
  const count = await store.count('practice_accounts', {})
  const account = await store.insert('practice_accounts', {
    user_id: actor.user.id,
    company_id: actor.company.id,
    environment,
    reference: `${environment === 'demo' ? 'DEM' : 'PRA'}-${100_001 + count}`,
    status: 'active',
    opened_at: new Date().toISOString(),
    reset_count: 0,
    last_reset_at: null,
  } as Omit<PracticeAccount, 'id' | 'created_at' | 'updated_at'>)

  const opening = cents(OPENING_BALANCE_CENTS[environment])
  await post({
    accountId: account.id,
    environment,
    type: 'opening_balance',
    amount: opening,
    description: 'Opening virtual balance',
    idempotencyKey: `opening:${account.id}`,
  })
  await record(account, 'account_opened', `Sandbox account opened with ${format(opening)} of virtual cash.`)

  return account
}

/** Adds virtual cash. Contacts nothing, and can contact nothing. */
export async function addCash(
  actor: Actor,
  environment: SandboxEnvironment,
  amount: Cents,
): Promise<Cents> {
  requireEnabled(environment)
  if (amount <= 0) throw new PracticeError('Enter an amount to add.')
  const account = await ensureAccount(actor, environment)

  const balance = await balanceFor(account.id)
  if (balance + amount > MAX_VIRTUAL_BALANCE_CENTS) {
    throw new PracticeError(
      `A sandbox account holds at most ${format(cents(MAX_VIRTUAL_BALANCE_CENTS))} of virtual cash.`,
    )
  }

  // Keyed by the minute so a double-click adds once, while a person who
  // genuinely wants the same amount again a moment later still can.
  const minute = new Date().toISOString().slice(0, 16)
  await post({
    accountId: account.id,
    environment,
    type: 'deposit',
    amount,
    description: `Added ${format(amount)} of virtual cash`,
    idempotencyKey: `add:${amount}:${minute}`,
  })
  await record(account, 'cash_added', `Added ${format(amount)} of virtual cash.`, null, amount)
  return balanceFor(account.id)
}

export async function withdrawCash(
  actor: Actor,
  environment: SandboxEnvironment,
  amount: Cents,
): Promise<Cents> {
  requireEnabled(environment)
  if (amount <= 0) throw new PracticeError('Enter an amount to take out.')
  const account = await ensureAccount(actor, environment)
  const minute = new Date().toISOString().slice(0, 16)
  try {
    await post({
      accountId: account.id,
      environment,
      type: 'withdrawal',
      amount: cents(-amount),
      description: `Removed ${format(amount)} of virtual cash`,
      idempotencyKey: `remove:${amount}:${minute}`,
    })
  } catch (error) {
    if (error instanceof PracticeLedgerError) throw new PracticeError(error.message)
    throw error
  }
  await record(account, 'cash_withdrawn', `Removed ${format(amount)} of virtual cash.`, null, amount)
  return balanceFor(account.id)
}

/**
 * Starts over.
 *
 * The old account is closed rather than emptied, and a `practice_resets` row
 * records what was cleared. Deleting the history would leave a person unable
 * to answer "what did I have before I reset it", which is exactly the question
 * a reset makes them want to ask.
 */
export async function resetAccount(
  actor: Actor,
  environment: SandboxEnvironment,
): Promise<PracticeAccount> {
  requireEnabled(environment)
  const account = await accountFor(actor, environment)
  if (!account) return ensureAccount(actor, environment)

  const store = await db()
  // Every holding on the account, exited ones included. A reset closes the
  // account, so all of it goes out of view together — recording only what was
  // still active would say a portfolio of eight was a portfolio of one.
  const [balance, positions] = await Promise.all([
    balanceFor(account.id),
    store.select('practice_positions', { where: { account_id: account.id } }),
  ])
  const invested = positions.reduce((total, row) => total + row.invested_cents, 0)

  await store.insert('practice_resets', {
    account_id: account.id,
    cash_before_cents: balance,
    invested_before_cents: invested,
    positions_cleared: positions.length,
  } as never)
  await record(account, 'reset', `Portfolio cleared: ${positions.length} holding${positions.length === 1 ? '' : 's'} and ${format(balance)} of virtual cash.`)

  await store.update('practice_accounts', account.id, {
    status: 'closed',
  } as Partial<PracticeAccount>)

  return ensureAccount(actor, environment)
}

/** Appends to the account's history. */
export async function record(
  account: PracticeAccount,
  kind: PracticeActivityKind,
  summary: string,
  offeringId: string | null = null,
  amount: Cents | null = null,
): Promise<void> {
  const store = await db()
  await store.insert('practice_activity', {
    account_id: account.id,
    environment: account.environment,
    kind,
    summary,
    offering_id: offeringId,
    amount_cents: amount,
  } as Omit<PracticeActivity, 'id' | 'created_at'>)
}

export async function activityFor(accountId: string): Promise<PracticeActivity[]> {
  const store = await db()
  return store.select('practice_activity', {
    where: { account_id: accountId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}
