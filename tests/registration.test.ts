import { beforeEach, describe, expect, it } from 'vitest'
import { createActor, installTestStore } from './helpers/harness'
import type { Store } from '@/db/store'
import { INTENTS, isIntent, register } from '@/services/auth'

/**
 * Registration tests.
 *
 * Every intent the sign-up form offers has to produce an account. The one that
 * did not was `invest` — the product's primary path — because the action
 * validated against a hand-written list that had never been updated when the
 * investor product was built. The form showed the choice already made and the
 * server answered "Choose what you are here to do".
 *
 * So the first test here is the one that would have caught it: not "does
 * invest work", but "does every intent work", which stays true as intents are
 * added.
 */

let store: Store

beforeEach(async () => {
  store = await installTestStore()
})

describe('signing up', () => {
  it('accepts every intent the product defines', () => {
    for (const intent of INTENTS) {
      expect(isIntent(intent), `${intent} is not accepted by the sign-up action`).toBe(true)
    }
    // The one that was rejected in production while the form offered it.
    expect(isIntent('invest')).toBe(true)
    expect(INTENTS).toContain('invest')
  })

  it('rejects anything that is not an intent', () => {
    for (const value of ['', 'browse', 'admin', 'INVEST', 'invest ']) {
      expect(isIntent(value)).toBe(false)
    }
  })

  it('creates an investor account, its company and its membership', async () => {
    const { actor } = await register({
      email: 'new@investor.test',
      password: 'AVeryGoodPassword123!',
      fullName: 'Aaron Tversky',
      companyName: 'Goldwater Care Investments',
      title: 'Principal',
      phone: null,
      intent: 'invest',
    })

    expect(actor.user.role).toBe('investor')
    expect(actor.company.type).toBe('investor')
    expect(actor.isInvestor).toBe(true)
    expect(actor.membership.role).toBe('owner')
    expect(await store.count('users', { where: { email: 'new@investor.test' } })).toBe(1)
  })

  it('creates an operator account from the other intent the form offers', async () => {
    const { actor } = await register({
      email: 'new@operator.test',
      password: 'AVeryGoodPassword123!',
      fullName: 'Dana Whitfield',
      companyName: 'Meridian Senior',
      title: null,
      phone: null,
      intent: 'find_financing',
    })
    expect(actor.user.role).toBe('borrower')
    expect(actor.company.type).toBe('borrower')
  })

  it('refuses a second account on the same email', async () => {
    const input = {
      email: 'taken@investor.test',
      password: 'AVeryGoodPassword123!',
      fullName: 'First Person',
      companyName: 'First Company',
      title: null,
      phone: null,
      intent: 'invest' as const,
    }
    await register(input)
    await expect(register({ ...input, fullName: 'Second Person' })).rejects.toThrow()
  })

  it('refuses a password that does not meet the stated rule', async () => {
    // The form promises ten characters with an uppercase, a lowercase and a
    // number. A server that accepted less would make the promise a lie.
    for (const password of ['short1A', 'alllowercase1', 'ALLUPPERCASE1', 'NoNumbersHere']) {
      await expect(register({
        email: `weak-${password}@investor.test`,
        password,
        fullName: 'Test Person',
        companyName: 'Test Company',
        title: null,
        phone: null,
        intent: 'invest',
      })).rejects.toThrow()
    }
  })

  it('does not care about the case or spacing of the email', async () => {
    await register({
      email: '  Mixed.Case@Investor.test ',
      password: 'AVeryGoodPassword123!',
      fullName: 'Test Person',
      companyName: 'Test Company',
      title: null,
      phone: null,
      intent: 'invest',
    })
    expect(await store.count('users', { where: { email: 'mixed.case@investor.test' } })).toBe(1)
  })
})

describe('where a new account lands', () => {
  it('sends a new investor to onboarding, never to the page for adding a property', async () => {
    const { actor } = await register({
      email: 'landing@investor.test',
      password: 'AVeryGoodPassword123!',
      fullName: 'Test Person',
      companyName: 'Test Company',
      title: null,
      phone: null,
      intent: 'invest',
    })
    // The registration action routes with the same function signing in uses.
    // Written out separately it sent every new investor to `/deals/new`.
    expect(actor.isInvestor).toBe(true)
    expect(actor.investor?.onboarding_stage ?? 'not_started').not.toBe('complete')
  })
})

describe('the demo accounts still work', () => {
  it('signs in a seeded user without a password', async () => {
    const seeded = await createActor(store, {
      email: 'demo@carecapital.test', name: 'Demo', companyName: 'Demo Co',
      companyType: 'investor', role: 'investor',
    })
    expect(seeded.user.email).toBe('demo@carecapital.test')
  })
})

describe('the demonstration without an account', () => {
  it('creates a guest with its own organisation and investor profile', async () => {
    const { createGuest, isGuest } = await import('@/services/auth')
    const { actor } = await createGuest()

    expect(isGuest(actor)).toBe(true)
    expect(actor.isInvestor).toBe(true)
    expect(actor.investor).not.toBeNull()
    // Its own organisation, so one visitor's sandbox is never another's.
    expect(actor.company.type).toBe('investor')
    expect(actor.membership.role).toBe('owner')
  })

  it('gives every guest a separate account', async () => {
    const { createGuest } = await import('@/services/auth')
    const [a, b] = await Promise.all([createGuest(), createGuest()])
    expect(a.actor.user.id).not.toBe(b.actor.user.id)
    expect(a.actor.company.id).not.toBe(b.actor.company.id)
    expect(a.actor.investor!.id).not.toBe(b.actor.investor!.id)
  })

  it('gives a guest no password, so nothing can sign into it', async () => {
    const { createGuest, login } = await import('@/services/auth')
    const { actor } = await createGuest()
    expect(actor.user.password_hash).toBeNull()
    // The session cookie is the only way back to it.
    await expect(login(actor.user.email, '')).rejects.toThrow()
    await expect(login(actor.user.email, 'AVeryGoodPassword123!')).rejects.toThrow()
  })

  it('refuses to open a live investment account for a guest', async () => {
    // The guarantee that matters: an account anybody on the internet can make
    // in one click must not reach the live money path, whatever is switched on.
    const { createGuest } = await import('@/services/auth')
    const { openAccount } = await import('@/services/accounts/accounts')
    const { actor } = await createGuest()

    await expect(openAccount(actor, { accountType: 'individual', legalName: 'Guest' }))
      .rejects.toThrow(/demonstration cannot/i)
    expect(await store.count('investor_accounts', {})).toBe(0)
  })

  it('still opens a live investment account for an ordinary investor', async () => {
    const { register } = await import('@/services/auth')
    const { openAccount } = await import('@/services/accounts/accounts')
    const { createInvestorProfile } = await import('@/services/equity/investors')
    const { attachInvestor } = await import('./helpers/harness')

    const { actor } = await register({
      email: 'real@investor.test',
      password: 'AVeryGoodPassword123!',
      fullName: 'Real Person',
      companyName: 'Real Investments',
      title: null, phone: null, intent: 'invest',
    })
    await createInvestorProfile(actor, {
      display_name: 'Real Person', investor_type: 'individual', state: 'IL',
    })
    const withProfile = await attachInvestor(store, actor)

    const account = await openAccount(withProfile, {
      accountType: 'individual', legalName: 'Real Person',
    })
    expect(account.id).toBeTruthy()
  })

  it('gives a guest a demonstration sandbox that works', async () => {
    const { createGuest } = await import('@/services/auth')
    const { ensureAccount } = await import('@/services/practice/accounts')
    const { balanceFor } = await import('@/services/practice/ledger')
    const { OPENING_BALANCE_CENTS } = await import('@/types/practice')
    const { actor } = await createGuest()

    const sandbox = await ensureAccount(actor, 'demo')
    expect(await balanceFor(sandbox.id)).toBe(OPENING_BALANCE_CENTS.demo)
  })
})
