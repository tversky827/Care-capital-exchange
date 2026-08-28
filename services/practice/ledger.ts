import 'server-only'
import { db } from '@/db'
import { cents, type Cents } from '@/lib/money'
import { withKeyLock } from '@/lib/utils/mutex'
import type { PracticeEntryType, PracticeLedgerEntry } from '@/types/practice'
import type { SandboxEnvironment } from '@/lib/environment'

/**
 * The sandbox's cash ledger.
 *
 * Deliberately a separate module from `services/accounts/ledger`, and it
 * imports nothing from it. The two look alike because the same arithmetic is
 * correct in both places, not because one is configured to behave like the
 * other — a shared module with an `environment` argument would be one bad
 * default away from posting virtual money to a real account.
 *
 * A balance is the sum of the entries and is never stored. There is no pending
 * state: virtual money has no bank behind it to clear through, so an entry is
 * posted the moment it exists, and a correction is a reversing entry rather
 * than an edit.
 */

export interface PostPracticeEntry {
  accountId: string
  environment: SandboxEnvironment
  type: PracticeEntryType
  /** Signed. Positive credits the holder, negative debits them. */
  amount: Cents
  description: string
  idempotencyKey: string
  referenceType?: PracticeLedgerEntry['reference_type']
  referenceId?: string | null
  effectiveAt?: string
}

export async function entriesFor(accountId: string): Promise<PracticeLedgerEntry[]> {
  const store = await db()
  return store.select('practice_ledger_entries', {
    where: { account_id: accountId },
    orderBy: { field: 'effective_at', dir: 'desc' },
  })
}

/** What the account holds, in cents. The sum of every entry, and nothing else. */
export async function balanceFor(accountId: string): Promise<Cents> {
  const entries = await entriesFor(accountId)
  return cents(entries.reduce((total, entry) => total + entry.amount_cents, 0))
}

export class PracticeLedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PracticeLedgerError'
  }
}

/**
 * Serialises everything that writes against one account's balance.
 *
 * Exported because posting an entry is rarely the whole operation: an
 * investment writes a debit AND a position, and the two have to be decided
 * together or a replayed request adds a second stake against one debit. A
 * caller that needs that atomicity takes this lock and calls `postWithin`.
 *
 * The lock is not reentrant, so `post` — which takes it — must never be called
 * from inside it. That is the entire reason the two functions are separate.
 */
export async function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  return withKeyLock(`practice:${accountId}`, fn)
}

export interface PostedEntry {
  entry: PracticeLedgerEntry
  /** False when an entry with this key already existed: a replay, not a new event. */
  created: boolean
}

/**
 * Writes one entry, assuming the account's lock is already held.
 *
 * The idempotency check and the balance check are both in here rather than in
 * the caller, because a check outside the lock is a check two concurrent
 * callers can both pass.
 *
 * A debit that would take the balance below zero is refused rather than
 * clamped. Virtual money that can go negative teaches that real money can.
 */
export async function postWithin(input: PostPracticeEntry): Promise<PostedEntry> {
  if (input.amount === 0) {
    throw new PracticeLedgerError('An entry that moves nothing is not an entry.')
  }
  const store = await db()

  const existing = await store.selectOne('practice_ledger_entries', {
    where: { account_id: input.accountId, idempotency_key: input.idempotencyKey },
  })
  if (existing) return { entry: existing, created: false }

  if (input.amount < 0) {
    const balance = await balanceFor(input.accountId)
    if (balance + input.amount < 0) {
      throw new PracticeLedgerError('That is more than the virtual cash in this account.')
    }
  }

  const entry = await store.insert('practice_ledger_entries', {
    account_id: input.accountId,
    environment: input.environment,
    type: input.type,
    amount_cents: input.amount,
    description: input.description,
    idempotency_key: input.idempotencyKey,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    effective_at: input.effectiveAt ?? new Date().toISOString(),
  } as Omit<PracticeLedgerEntry, 'id' | 'created_at'>)
  return { entry, created: true }
}

/** Writes one entry, taking the lock. Never call from inside `withAccountLock`. */
export async function post(input: PostPracticeEntry): Promise<PracticeLedgerEntry> {
  const { entry } = await withAccountLock(input.accountId, () => postWithin(input))
  return entry
}

/**
 * Cancels an earlier entry with an equal and opposite one.
 *
 * The original stays. A history that can be edited is not a history, and the
 * point of showing a person a ledger is that they can add it up themselves.
 */
export async function reverse(
  entryId: string,
  reason: string,
): Promise<PracticeLedgerEntry> {
  const store = await db()
  const original = await store.findById('practice_ledger_entries', entryId)
  if (!original) throw new PracticeLedgerError('No such entry.')
  return post({
    accountId: original.account_id,
    environment: original.environment,
    type: original.amount_cents < 0 ? 'investment_refund' : 'adjustment',
    amount: cents(-original.amount_cents),
    description: reason,
    idempotencyKey: `reverse:${entryId}`,
    referenceType: original.reference_type ?? undefined,
    referenceId: original.reference_id,
  })
}
