import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { add, cents, isNegative, negate, ZERO, type Cents } from '@/lib/money'
import { recordAudit } from '../audit'
import type { Actor } from '@/lib/auth/session'
import type {
  CashBalance, CashLedgerEntry, LedgerEntryStatus, LedgerEntryType,
} from '@/types/accounts'

/**
 * The cash ledger.
 *
 * Every movement of an investor's money is an immutable entry here, and every
 * balance shown anywhere in the product is the sum of these entries. There is
 * no balance column. That is the whole design, and it exists because a stored
 * balance and a list of transactions are two sources of truth that will
 * eventually disagree — and when they do, nobody can tell which is right.
 *
 * Four rules, all enforced here rather than by convention:
 *
 *   1. An entry is written once. Its amount, type, account and key never
 *      change. A mistake is corrected by `reverse`, which writes an opposing
 *      entry pointing back at the original.
 *   2. Only `status` advances, along a fixed path, and only forwards.
 *   3. A debit that would take the available balance below zero is refused.
 *      There is no overdraft on this platform and no code path that creates
 *      one.
 *   4. Every write carries an idempotency key unique to the account. A
 *      repeated key returns the entry already written. This is what makes a
 *      double-clicked button, a retried request and a replayed webhook safe.
 *
 * Concurrency: writes against one account are serialised through an in-process
 * lock, which is sufficient for the single-node demo and is NOT sufficient for
 * a multi-instance deployment. The durable guarantee is the unique index on
 * (account, idempotency key), which holds across processes: two concurrent
 * requests to spend the same money must carry either the same key, in which
 * case the second is a no-op, or different keys, in which case the second is
 * refused by the balance check inside the lock. On Postgres the balance check
 * additionally needs a `select ... for update` on the account row; migration
 * 0006 documents that and provides the function.
 */

/** Statuses a pending entry may advance to. Nothing else is permitted. */
const ADVANCES_TO: Record<LedgerEntryStatus, LedgerEntryStatus[]> = {
  pending: ['posted', 'failed', 'cancelled'],
  posted: ['reversed'],
  failed: [],
  cancelled: [],
  reversed: [],
}

/**
 * Entries that count toward the settled balance.
 *
 * A reversed entry still counts, which looks wrong and is not. The reversal is
 * what cancels it — an equal and opposite entry sitting beside it — so
 * excluding the original as well would subtract the same money twice. The
 * `reversed` status is a marker for the reader, not an instruction to the
 * arithmetic: what happened, happened, and the correction is its own row.
 */
function isSettled(entry: CashLedgerEntry): boolean {
  return entry.status === 'posted' || entry.status === 'reversed'
}

const locks = new Map<string, Promise<unknown>>()

/**
 * Serialises writes against one account.
 *
 * Two orders placed in the same tick would otherwise both read the balance
 * before either wrote, and both would pass a check the pair of them fails.
 */
async function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(accountId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  locks.set(accountId, run.then(() => undefined, () => undefined))
  try {
    return await run
  } finally {
    if (locks.get(accountId) === undefined) locks.delete(accountId)
  }
}

export interface PostEntryInput {
  accountId: string
  cashAccountId: string
  type: LedgerEntryType
  /** Signed. Positive credits the investor, negative debits them. */
  amount: Cents
  description: string
  idempotencyKey: string
  status?: Extract<LedgerEntryStatus, 'pending' | 'posted'>
  referenceType?: CashLedgerEntry['reference_type']
  referenceId?: string | null
  effectiveAt?: string
  providerTransactionId?: string | null
}

/** Every entry on an account, newest first. The account's whole history. */
export async function entriesFor(accountId: string): Promise<CashLedgerEntry[]> {
  const store = await db()
  return store.select('cash_ledger_entries', {
    where: { account_id: accountId },
    orderBy: { field: 'effective_at', dir: 'desc' },
  })
}

/**
 * The balance, derived.
 *
 * Available is what has settled. Pending is split by direction because the two
 * mean opposite things to an investor: money arriving is not yet theirs to
 * spend, and money leaving is already spoken for.
 */
export async function balanceFor(accountId: string): Promise<CashBalance> {
  const entries = await entriesFor(accountId)

  let available = ZERO
  let incoming = ZERO
  let outgoing = ZERO

  for (const entry of entries) {
    const amount = cents(entry.amount_cents)
    if (isSettled(entry)) {
      available = add(available, amount)
    } else if (entry.status === 'pending') {
      if (isNegative(amount)) outgoing = add(outgoing, negate(amount))
      else incoming = add(incoming, amount)
    }
  }

  return {
    available_cents: available,
    pending_incoming_cents: incoming,
    pending_outgoing_cents: outgoing,
    projected_cents: available + incoming - outgoing,
  }
}

/**
 * What the account can actually spend right now.
 *
 * Settled money less anything already committed to an unsettled order or
 * withdrawal. Pending deposits are excluded on purpose: money that has not
 * cleared cannot be invested, and letting it be would mean an order failing
 * days later because a transfer bounced.
 */
export async function spendableFor(accountId: string): Promise<Cents> {
  const balance = await balanceFor(accountId)
  return cents(balance.available_cents - balance.pending_outgoing_cents)
}

/**
 * Writes an entry.
 *
 * A debit is refused unless the account can cover it. The check and the write
 * happen inside the same lock, so nothing can be spent twice.
 */
export async function post(input: PostEntryInput): Promise<CashLedgerEntry> {
  return withAccountLock(input.accountId, async () => {
    const store = await db()

    // An idempotency key that has been seen returns what it wrote. This is
    // checked first so a retry never even reaches the balance check, which it
    // would now fail — the money it is retrying is already committed.
    const existing = await store.selectOne('cash_ledger_entries', {
      where: { account_id: input.accountId, idempotency_key: input.idempotencyKey },
    })
    if (existing) return existing

    const amount = cents(input.amount)
    if (amount === 0) throw new Error('A ledger entry must move a non-zero amount.')

    if (isNegative(amount)) {
      const spendable = await spendableFor(input.accountId)
      authorize(
        spendable + amount >= 0,
        'This account does not have enough available cash for that.',
      )
    }

    const now = new Date().toISOString()
    const status = input.status ?? 'posted'
    return store.insert('cash_ledger_entries', {
      cash_account_id: input.cashAccountId,
      account_id: input.accountId,
      type: input.type,
      amount_cents: amount,
      currency: 'USD',
      status,
      description: input.description,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      idempotency_key: input.idempotencyKey,
      reverses_entry_id: null,
      provider_transaction_id: input.providerTransactionId ?? null,
      effective_at: input.effectiveAt ?? now,
      posted_at: status === 'posted' ? now : null,
    } as Omit<CashLedgerEntry, 'id' | 'created_at'>)
  })
}

/**
 * Advances a pending entry.
 *
 * The only mutation this module permits, and only along `ADVANCES_TO`. An
 * entry that has already reached its destination is returned unchanged rather
 * than moved again, so a webhook delivered twice is harmless.
 */
export async function advance(
  entryId: string,
  to: LedgerEntryStatus,
): Promise<CashLedgerEntry> {
  const store = await db()
  const entry = await store.findById('cash_ledger_entries', entryId)
  if (!entry) throw new Error('Ledger entry not found.')
  if (entry.status === to) return entry

  authorize(
    ADVANCES_TO[entry.status].includes(to),
    `A ${entry.status} entry cannot become ${to}.`,
  )

  // Posting a debit that has been sitting pending re-checks the balance: the
  // money was reserved when the entry was written, but a reversal in between
  // could have taken it away.
  return withAccountLock(entry.account_id, async () => {
    if (to === 'posted' && isNegative(cents(entry.amount_cents))) {
      const balance = await balanceFor(entry.account_id)
      authorize(
        balance.available_cents + entry.amount_cents >= 0,
        'This account no longer has enough available cash to post that.',
      )
    }
    return store.update('cash_ledger_entries', entryId, {
      status: to,
      posted_at: to === 'posted' ? new Date().toISOString() : entry.posted_at,
    } as Partial<CashLedgerEntry>)
  })
}

/**
 * Corrects a posted entry by writing its opposite.
 *
 * The original is marked reversed and otherwise left exactly as it was. Both
 * rows stay on the statement, because "this happened and then it was undone"
 * is the truth, and an entry that quietly disappears is the thing that makes a
 * statement impossible to trust.
 */
export async function reverse(
  actor: Actor,
  entryId: string,
  reason: string,
): Promise<CashLedgerEntry> {
  authorize(actor.isAdmin, 'Only an administrator can reverse a ledger entry.')
  const store = await db()
  const original = await store.findById('cash_ledger_entries', entryId)
  if (!original) throw new Error('Ledger entry not found.')
  authorize(original.status === 'posted', 'Only a posted entry can be reversed.')

  const reversal = await withAccountLock(original.account_id, async () => {
    const existing = await store.selectOne('cash_ledger_entries', {
      where: { account_id: original.account_id, idempotency_key: `reversal:${entryId}` },
    })
    if (existing) return existing
    const now = new Date().toISOString()
    return store.insert('cash_ledger_entries', {
      cash_account_id: original.cash_account_id,
      account_id: original.account_id,
      type: 'adjustment',
      amount_cents: -original.amount_cents,
      currency: 'USD',
      status: 'posted',
      description: `Reversal: ${original.description}. ${reason}`,
      reference_type: original.reference_type,
      reference_id: original.reference_id,
      idempotency_key: `reversal:${entryId}`,
      reverses_entry_id: entryId,
      provider_transaction_id: null,
      effective_at: now,
      posted_at: now,
    } as Omit<CashLedgerEntry, 'id' | 'created_at'>)
  })

  await store.update('cash_ledger_entries', entryId, { status: 'reversed' } as Partial<CashLedgerEntry>)

  await recordAudit({
    actor,
    action: 'cash.entry_reversed',
    entityType: 'cash_ledger_entry',
    entityId: entryId,
    summary: `Reversed ${original.description} on account ${original.account_id}.`,
    metadata: { reason, amountCents: original.amount_cents, reversalId: reversal.id },
  })

  return reversal
}

/**
 * Proves the ledger adds up.
 *
 * Recomputes the balance from every entry and compares it against a caller's
 * expectation — the figure a provider reports, or the figure a screen showed.
 * A reconciliation job calls this; so does the test suite.
 */
export async function reconcile(
  accountId: string,
  expected: Cents,
): Promise<{ balanced: boolean; derived: Cents; difference: Cents; entryCount: number }> {
  const entries = await entriesFor(accountId)
  const derived = entries
    .filter(isSettled)
    .reduce<Cents>((total, entry) => add(total, cents(entry.amount_cents)), ZERO)
  return {
    balanced: derived === expected,
    derived,
    difference: cents(derived - expected),
    entryCount: entries.length,
  }
}
