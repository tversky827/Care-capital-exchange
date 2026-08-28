import { beforeEach, describe, expect, it } from 'vitest'
import { createActor, installTestStore } from './helpers/harness'
import { cents, fromDollars } from '@/lib/money'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import {
  advance, balanceFor, entriesFor, post, reconcile, reverse, spendableFor,
} from '@/services/accounts/ledger'

/**
 * Ledger tests.
 *
 * Written as attacks rather than features: the question is not whether a
 * deposit shows up, it is whether money can be created, spent twice, or made
 * to disappear. Every case here is something that would be a real loss if it
 * were possible.
 */

let store: Store
let admin: Actor
let accountId: string
let cashAccountId: string
let otherAccountId: string

async function openAccount(name: string): Promise<{ accountId: string; cashAccountId: string }> {
  const account = await store.insert('investor_accounts', {
    company_id: crypto.randomUUID(),
    investor_id: null,
    account_type: 'individual',
    legal_name: name,
    reference: `ACC-${name}`,
    status: 'active',
    identity_status: 'passed',
    kyc_status: 'passed',
    aml_status: 'passed',
    accreditation_status: 'passed',
    tax_status: 'passed',
    activated_at: new Date().toISOString(),
    status_reason: null,
  } as never)
  const cash = await store.insert('cash_accounts', {
    account_id: account.id, currency: 'USD', provider: null,
    provider_account_ref: null, status: 'open',
  } as never)
  return { accountId: account.id, cashAccountId: cash.id }
}

/** A deposit that has settled, so there is something to try to steal. */
async function fund(account: string, cash: string, dollars: number, key: string) {
  return post({
    accountId: account, cashAccountId: cash, type: 'deposit',
    amount: fromDollars(dollars), description: 'Demo deposit', idempotencyKey: key,
  })
}

beforeEach(async () => {
  store = await installTestStore()
  admin = await createActor(store, {
    email: 'admin@ledger.test', name: 'Admin', companyName: 'CareCapital',
    companyType: 'admin', role: 'admin',
  })
  const a = await openAccount('alice')
  const b = await openAccount('bob')
  accountId = a.accountId
  cashAccountId = a.cashAccountId
  otherAccountId = b.accountId
})

describe('a balance is the sum of its entries', () => {
  it('starts at zero with no entries', async () => {
    const balance = await balanceFor(accountId)
    expect(balance.available_cents).toBe(0)
    expect(balance.projected_cents).toBe(0)
  })

  it('adds deposits and subtracts debits exactly', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    await post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-25_000),
      description: 'Investment', idempotencyKey: 'inv-1',
    })
    await post({
      accountId, cashAccountId, type: 'distribution_credit', amount: fromDollars(1_850),
      description: 'Q2 distribution', idempotencyKey: 'dist-1',
    })
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(76_850))
  })

  it('holds a pending deposit out of the spendable balance', async () => {
    await post({
      accountId, cashAccountId, type: 'deposit', amount: fromDollars(50_000),
      description: 'ACH in flight', idempotencyKey: 'dep-pending', status: 'pending',
    })
    const balance = await balanceFor(accountId)
    expect(balance.available_cents).toBe(0)
    expect(balance.pending_incoming_cents).toBe(fromDollars(50_000))
    expect(balance.projected_cents).toBe(fromDollars(50_000))
    // Uncleared money cannot be invested.
    expect(await spendableFor(accountId)).toBe(0)
  })

  it('treats a pending debit as already spoken for', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    await post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-40_000),
      description: 'Order placed', idempotencyKey: 'ord-1', status: 'pending',
    })
    const balance = await balanceFor(accountId)
    expect(balance.available_cents).toBe(fromDollars(100_000))
    expect(balance.pending_outgoing_cents).toBe(fromDollars(40_000))
    expect(await spendableFor(accountId)).toBe(fromDollars(60_000))
  })
})

describe('money cannot be spent that is not there', () => {
  it('refuses a debit larger than the balance', async () => {
    await fund(accountId, cashAccountId, 10_000, 'dep-1')
    await expect(post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-10_001),
      description: 'Too much', idempotencyKey: 'over-1',
    })).rejects.toThrow(/enough available cash/)
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(10_000))
  })

  it('refuses a debit against an empty account', async () => {
    await expect(post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-1),
      description: 'Nothing there', idempotencyKey: 'over-2',
    })).rejects.toThrow(/enough available cash/)
  })

  it('will not let pending debits add up past the balance', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    await post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-60_000),
      description: 'Order A', idempotencyKey: 'ord-a', status: 'pending',
    })
    // 60k is already committed; only 40k is left, so a second 60k order fails.
    await expect(post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-60_000),
      description: 'Order B', idempotencyKey: 'ord-b', status: 'pending',
    })).rejects.toThrow(/enough available cash/)
  })

  it('cannot be raced into a double spend', async () => {
    await fund(accountId, cashAccountId, 50_000, 'dep-1')
    // Two orders for the whole balance, placed in the same tick with different
    // keys. Exactly one may succeed.
    const results = await Promise.allSettled([
      post({
        accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-50_000),
        description: 'Race A', idempotencyKey: 'race-a',
      }),
      post({
        accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-50_000),
        description: 'Race B', idempotencyKey: 'race-b',
      }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect((await balanceFor(accountId)).available_cents).toBe(0)
  })

  it('never leaves an account negative, whatever the sequence', async () => {
    await fund(accountId, cashAccountId, 1_000, 'dep-1')
    const attempts = Array.from({ length: 20 }, (_, i) => post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-100),
      description: `Debit ${i}`, idempotencyKey: `many-${i}`,
    }).catch(() => null))
    await Promise.all(attempts)
    expect((await balanceFor(accountId)).available_cents).toBeGreaterThanOrEqual(0)
  })
})

describe('the same instruction never happens twice', () => {
  it('returns the original entry for a repeated key', async () => {
    const first = await fund(accountId, cashAccountId, 25_000, 'dep-same')
    const second = await fund(accountId, cashAccountId, 25_000, 'dep-same')
    expect(second.id).toBe(first.id)
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(25_000))
  })

  it('survives a double-clicked invest button', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    const key = 'order:abc123'
    await Promise.all([
      post({
        accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-25_000),
        description: 'Chicago SNF', idempotencyKey: key,
      }),
      post({
        accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-25_000),
        description: 'Chicago SNF', idempotencyKey: key,
      }),
    ])
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(75_000))
    expect(await entriesFor(accountId)).toHaveLength(2)
  })

  it('keys are scoped to the account, not global', async () => {
    await fund(accountId, cashAccountId, 10_000, 'shared-key')
    const other = await store.selectOne('cash_accounts', { where: { account_id: otherAccountId } })
    await post({
      accountId: otherAccountId, cashAccountId: other!.id, type: 'deposit',
      amount: fromDollars(7_000), description: 'Bob deposit', idempotencyKey: 'shared-key',
    })
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(10_000))
    expect((await balanceFor(otherAccountId)).available_cents).toBe(fromDollars(7_000))
  })
})

describe('an entry advances, it does not change', () => {
  it('posts a pending deposit and makes it spendable', async () => {
    const entry = await post({
      accountId, cashAccountId, type: 'deposit', amount: fromDollars(30_000),
      description: 'ACH', idempotencyKey: 'dep-p', status: 'pending',
    })
    expect(await spendableFor(accountId)).toBe(0)
    await advance(entry.id, 'posted')
    expect(await spendableFor(accountId)).toBe(fromDollars(30_000))
  })

  it('refuses to move backwards or sideways', async () => {
    const entry = await fund(accountId, cashAccountId, 1_000, 'dep-1')
    await expect(advance(entry.id, 'pending')).rejects.toThrow(/cannot become/)
    await expect(advance(entry.id, 'failed')).rejects.toThrow(/cannot become/)
  })

  it('is a no-op when the entry is already there', async () => {
    const entry = await fund(accountId, cashAccountId, 1_000, 'dep-1')
    await expect(advance(entry.id, 'posted')).resolves.toMatchObject({ id: entry.id })
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(1_000))
  })

  it('drops a failed deposit out of the balance entirely', async () => {
    const entry = await post({
      accountId, cashAccountId, type: 'deposit', amount: fromDollars(20_000),
      description: 'Bounced ACH', idempotencyKey: 'dep-fail', status: 'pending',
    })
    await advance(entry.id, 'failed')
    const balance = await balanceFor(accountId)
    expect(balance.available_cents).toBe(0)
    expect(balance.pending_incoming_cents).toBe(0)
    expect(balance.projected_cents).toBe(0)
  })
})

describe('corrections leave a trail', () => {
  it('reverses by writing the opposite, keeping both rows', async () => {
    const entry = await fund(accountId, cashAccountId, 5_000, 'dep-1')
    await reverse(admin, entry.id, 'Duplicate of an earlier deposit.')

    expect((await balanceFor(accountId)).available_cents).toBe(0)
    const entries = await entriesFor(accountId)
    expect(entries).toHaveLength(2)
    // The original is still there, marked, not deleted.
    const original = entries.find((e) => e.id === entry.id)!
    expect(original.status).toBe('reversed')
    expect(original.amount_cents).toBe(fromDollars(5_000))
    const reversal = entries.find((e) => e.reverses_entry_id === entry.id)!
    expect(reversal.amount_cents).toBe(fromDollars(-5_000))
  })

  it('only an administrator may reverse', async () => {
    const investor = await createActor(store, {
      email: 'inv@ledger.test', name: 'Investor', companyName: 'Inv Ltd',
      companyType: 'investor', role: 'investor',
    })
    const entry = await fund(accountId, cashAccountId, 5_000, 'dep-1')
    await expect(reverse(investor, entry.id, 'I would like my money back twice.'))
      .rejects.toThrow(/administrator/)
  })

  it('reversing twice does not take the money twice', async () => {
    const entry = await fund(accountId, cashAccountId, 5_000, 'dep-1')
    await reverse(admin, entry.id, 'First.')
    await expect(reverse(admin, entry.id, 'Second.')).rejects.toThrow(/posted entry/)
    expect((await balanceFor(accountId)).available_cents).toBe(0)
  })
})

describe('reconciliation', () => {
  it('agrees with the entries when nothing is wrong', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    await post({
      accountId, cashAccountId, type: 'investment_debit', amount: fromDollars(-25_000),
      description: 'Investment', idempotencyKey: 'inv-1',
    })
    const result = await reconcile(accountId, fromDollars(75_000))
    expect(result.balanced).toBe(true)
    expect(result.difference).toBe(0)
    expect(result.entryCount).toBe(2)
  })

  it('reports the difference when a provider disagrees', async () => {
    await fund(accountId, cashAccountId, 100_000, 'dep-1')
    const result = await reconcile(accountId, fromDollars(99_999))
    expect(result.balanced).toBe(false)
    expect(result.difference).toBe(cents(100))
  })
})
