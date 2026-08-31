import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { attachInvestor, createActor, installTestStore } from './helpers/harness'
import { cents, fromDollars } from '@/lib/money'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'
import type { Offering } from '@/types/equity'

import { createDeal } from '@/services/deals'
import { createOffering, publishOffering } from '@/services/equity/offerings'
import { acceptNda } from '@/services/equity/nda'
import {
  advanceOnboarding, createInvestorProfile, requestVerification, setVerificationStatus,
  updatePreferences,
} from '@/services/equity/investors'
import {
  accountFor, addCash, ensureAccount, resetAccount, withdrawCash, PracticeError,
} from '@/services/practice/accounts'
import { balanceFor, entriesFor, post } from '@/services/practice/ledger'
import { invest, positionIn, simulateDistribution, simulateExit } from '@/services/practice/investing'
import { diversification, portfolioFor } from '@/services/practice/portfolio'
import { OPENING_BALANCE_CENTS, MAX_VIRTUAL_BALANCE_CENTS } from '@/types/practice'

/**
 * Sandbox tests.
 *
 * The first block is the journey the sandbox exists for. Everything after it
 * is an attempt to make virtual money behave like real money, or to reach the
 * production tables from inside the sandbox. Those are the tests that matter:
 * the guarantee this feature makes is a negative one, and a negative guarantee
 * is only worth what its attempts to break it are worth.
 */

let store: Store
let sponsor: Actor
let admin: Actor
let investor: Actor
let other: Actor
let deal: Deal
let offering: Offering
let closedOffering: Offering

async function onboard(actor: Actor, name: string): Promise<Actor> {
  await createInvestorProfile(actor, { display_name: name, investor_type: 'individual', state: 'IL' })
  let current = await attachInvestor(store, actor)
  await updatePreferences(current, {
    asset_types: ['snf'], states: ['IL'], capital_positions: ['common_equity'],
  })
  for (const stage of ['experience', 'preferences', 'risk', 'eligibility'] as const) {
    current = await attachInvestor(store, current)
    await advanceOnboarding(current, stage)
  }
  current = await attachInvestor(store, current)
  for (const kind of ['identity', 'kyc', 'aml'] as const) await requestVerification(current, kind)
  await setVerificationStatus(admin, current.investor!.id, 'accreditation', 'verified', 'Test.')
  for (const stage of ['kyc', 'accreditation', 'agreements', 'account'] as const) {
    current = await attachInvestor(store, current)
    await advanceOnboarding(current, stage)
  }
  return attachInvestor(store, current)
}

async function buildOffering(name: string): Promise<Offering> {
  const created = await createOffering(sponsor, deal.id, {
    name,
    offering_type: 'reg_d_506b',
    issuer_entity: 'Meridian Chicago Holdings LLC',
    target_raise: 8_000_000,
    minimum_investment: 10_000,
    maximum_investment: 500_000,
    terms: {
      capital_position: 'common_equity',
      target_hold_months: 60,
      preferred_return_pct: 0.08,
      assumptions: {
        hold_years: 5, exit_cap_rate_pct: 11, exit_multiple_of_ebitda: null,
        revenue_growth_pct: 3, expense_growth_pct: 3, occupancy_stabilized_pct: 88,
        capex_per_bed: 420, selling_costs_pct: 2, notes: null,
      },
    },
  })
  return publishOffering(admin, created.id)
}

beforeAll(async () => {
  store = await installTestStore()
  admin = await createActor(store, {
    email: 'admin@sandbox.test', name: 'Admin', companyName: 'CareCapital',
    companyType: 'admin', role: 'admin',
  })
  sponsor = await createActor(store, {
    email: 'sponsor@sandbox.test', name: 'Sponsor', companyName: 'Meridian',
    companyType: 'borrower', role: 'borrower',
  })
  investor = await onboard(await createActor(store, {
    email: 'practice@sandbox.test', name: 'Pat Practice', companyName: 'Practice Investments',
    companyType: 'investor', role: 'investor',
  }), 'Pat Practice')
  other = await onboard(await createActor(store, {
    email: 'other@sandbox.test', name: 'Other Person', companyName: 'Other Investments',
    companyType: 'investor', role: 'investor',
  }), 'Other Person')

  deal = await createDeal({
    actor: sponsor,
    name: 'Chicago Senior Care',
    assetType: 'snf',
    transactionType: 'acquisition',
    borrowerPriority: 'lowest_rate',
    facility: {
      name: 'Chicago Senior Care', city: 'Chicago', state: 'IL',
      licensed_beds: 128, operating_beds: 128, current_census: 112, occupancy_pct: 87.5,
      year_built: 2001, real_estate_included: true,
    },
    terms: {
      purchase_price: 20_000_000, requested_financing: 13_000_000,
      appraised_value: 20_400_000, estimated_closing_costs: 600_000,
      requested_rate_pct: 7, requested_term_months: 60, requested_amortization_months: 300,
    },
    sponsor: {
      legal_entity: 'Meridian LLC', years_in_healthcare: 18, years_operating_asset_type: 14,
      facilities_operated: 9, beds_operated: 1_100, states_operated: ['IL'],
      historical_acquisitions: 6, previous_exits: 2, prior_defaults: false,
      net_worth: 30_000_000, liquidity: 8_000_000,
    },
  })

  const period = await store.insert('financial_periods', {
    deal_id: deal.id, label: 'TTM 2026-06', period_type: 'ttm', fiscal_year: 2026,
    start_date: '2025-07-01', end_date: '2026-06-30', source: 'test', is_primary: true,
  } as never)
  for (const [key, value] of [
    ['revenue', 21_600_000], ['ebitda', 2_400_000], ['labor_expense', 11_772_000],
    ['agency_labor', 470_880], ['total_operating_expense', 19_200_000],
  ] as const) {
    await store.insert('financial_line_items', {
      period_id: period.id, deal_id: deal.id, key, label: key, value,
      proposed_value: null, approved_value: value, approved_by: sponsor.user.id,
      approved_at: new Date().toISOString(), source_document_id: null, source_page: null,
      confidence: 1,
    } as never)
  }

  offering = await buildOffering('Chicago Senior Care Equity')
  closedOffering = await buildOffering('Chicago Senior Care Preferred')
  await store.update('offerings', closedOffering.id, { status: 'closed' } as never)

  await acceptNda(investor, offering.id, 'Pat Practice')
})

// ---------------------------------------------------------------------------

describe('the journey the sandbox exists for', () => {
  it('opens an account, invests, simulates a distribution and a sale', async () => {
    const account = await ensureAccount(investor, 'practice')
    expect(await balanceFor(account.id)).toBe(OPENING_BALANCE_CENTS.practice)

    // The opening balance is a ledger entry, not a number written on the
    // account: the first line of the history explains where the money came from.
    const opening = await entriesFor(account.id)
    expect(opening).toHaveLength(1)
    expect(opening[0]!.type).toBe('opening_balance')

    const position = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'journey-1',
    })
    expect(position.invested_cents).toBe(fromDollars(25_000))
    expect(await balanceFor(account.id)).toBe(fromDollars(75_000))

    const { amount, period } = await simulateDistribution(investor, 'practice', position.id)
    expect(period).toBe(1)
    expect(amount).toBeGreaterThan(0)
    expect(await balanceFor(account.id)).toBe(fromDollars(75_000) + amount)

    const exit = await simulateExit(investor, 'practice', position.id)
    expect(exit.proceeds).toBeGreaterThan(0)
    const after = await store.findById('practice_positions', position.id)
    expect(after!.status).toBe('exited')

    // The balance is the sum of the entries and nothing else.
    const entries = await entriesFor(account.id)
    expect(entries.reduce((total, entry) => total + entry.amount_cents, 0))
      .toBe(await balanceFor(account.id))
  })

  it('produces a portfolio whose figures reconcile with the ledger', async () => {
    const account = (await accountFor(investor, 'practice'))!
    const portfolio = await portfolioFor(account.id)
    expect(portfolio.cashCents).toBe(await balanceFor(account.id))
    expect(portfolio.investedCents).toBe(fromDollars(25_000))
    expect(portfolio.exited).toBe(1)
    // Everything held is exited, so nothing is carried at cost.
    expect(portfolio.accountValueCents).toBe(portfolio.cashCents)
  })

  it('reopens with the starting balance after a reset, and keeps the record', async () => {
    const before = (await accountFor(investor, 'practice'))!
    const fresh = await resetAccount(investor, 'practice')
    expect(fresh.id).not.toBe(before.id)
    expect(await balanceFor(fresh.id)).toBe(OPENING_BALANCE_CENTS.practice)
    expect((await portfolioFor(fresh.id)).holdings).toHaveLength(0)

    // The cleared account is closed rather than emptied: what was there is
    // still answerable.
    const resets = await store.select('practice_resets', { where: { account_id: before.id } })
    expect(resets).toHaveLength(1)
    expect(resets[0]!.positions_cleared).toBe(1)
    expect((await store.findById('practice_accounts', before.id))!.status).toBe('closed')
    expect(await store.count('practice_positions', { where: { account_id: before.id } })).toBe(1)
  })
})

// ---------------------------------------------------------------------------

describe('the sandbox cannot reach the production system', () => {
  beforeEach(async () => {
    await ensureAccount(investor, 'practice')
  })

  it('does not change the offering it invests in', async () => {
    const before = await store.findById('offerings', offering.id)
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(20_000), idempotencyKey: `iso-${Date.now()}`,
    })
    const after = await store.findById('offerings', offering.id)

    // The number a sponsor watches. If practice could move it, practice would
    // be a way to fake demand.
    expect(after!.committed_amount).toBe(before!.committed_amount)
    expect(after!.status).toBe(before!.status)
    expect(after!.updated_at).toBe(before!.updated_at)
  })

  it('creates nothing in any production table', async () => {
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(15_000), idempotencyKey: `iso2-${Date.now()}`,
    })

    // Every table the live investment path writes. A practice investment must
    // leave all of them exactly as it found them.
    for (const table of [
      'investment_orders', 'investment_commitments', 'investment_positions',
      'investment_transactions', 'cash_ledger_entries', 'cash_accounts', 'investor_accounts',
      'provider_transactions', 'provider_accounts', 'cash_transfers', 'distribution_events',
      'investment_distributions', 'billing_events',
    ] as const) {
      expect(await store.count(table, {}), `${table} was written by a practice investment`).toBe(0)
    }
  })

  it('never appears in the sponsor\'s view of who is interested', async () => {
    expect(await store.count('investment_interests', {})).toBe(0)
    expect(await store.count('investment_commitments', { where: { offering_id: offering.id } })).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('attempts to make virtual money behave like real money', () => {
  it('refuses to invest more than the virtual balance holds', async () => {
    const account = await ensureAccount(investor, 'practice')
    const balance = await balanceFor(account.id)
    await expect(invest(investor, 'practice', {
      offeringId: offering.id,
      amount: cents(balance + 1),
      idempotencyKey: `over-${Date.now()}`,
    })).rejects.toThrow(/more than the virtual cash/i)
  })

  it('lets the balance be spent exactly to zero, and no further', async () => {
    const fresh = await resetAccount(investor, 'practice')
    const balance = await balanceFor(fresh.id)
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: cents(balance), idempotencyKey: 'exact-1',
    })
    expect(await balanceFor(fresh.id)).toBe(0)
    await expect(invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'exact-2',
    })).rejects.toThrow(/more than the virtual cash/i)
  })

  it('refuses a negative or zero investment', async () => {
    await resetAccount(investor, 'practice')
    for (const amount of [0, -1, -100_000]) {
      await expect(invest(investor, 'practice', {
        offeringId: offering.id, amount: cents(amount), idempotencyKey: `neg-${amount}`,
      })).rejects.toThrow()
    }
  })

  it('holds a practice investor to the offering\'s real minimum and maximum', async () => {
    await expect(invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(500), idempotencyKey: 'min-1',
    })).rejects.toThrow(/minimum/i)
    await expect(invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(600_000), idempotencyKey: 'max-1',
    })).rejects.toThrow(/caps an individual investment/i)
  })

  it('records one investment when the same request arrives twice', async () => {
    const account = await resetAccount(investor, 'practice')
    const key = 'double-click'
    const first = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: key,
    })
    const second = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: key,
    })
    expect(second.id).toBe(first.id)
    expect(second.invested_cents).toBe(fromDollars(25_000))
    expect(await balanceFor(account.id)).toBe(fromDollars(75_000))
  })

  it('records one investment when both arrive in the same tick', async () => {
    const account = await resetAccount(investor, 'practice')
    const key = 'race'
    const [a, b] = await Promise.all([
      invest(investor, 'practice', {
        offeringId: offering.id, amount: fromDollars(30_000), idempotencyKey: key,
      }),
      invest(investor, 'practice', {
        offeringId: offering.id, amount: fromDollars(30_000), idempotencyKey: key,
      }),
    ])
    expect(a.id).toBe(b.id)
    expect(await balanceFor(account.id)).toBe(fromDollars(70_000))
  })

  it('cannot be raced into overdrawing with two different keys', async () => {
    const account = await resetAccount(investor, 'practice')
    const results = await Promise.allSettled([
      invest(investor, 'practice', {
        offeringId: offering.id, amount: fromDollars(80_000), idempotencyKey: 'race-a',
      }),
      invest(investor, 'practice', {
        offeringId: offering.id, amount: fromDollars(80_000), idempotencyKey: 'race-b',
      }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balanceFor(account.id)).toBe(fromDollars(20_000))
  })

  it('adds to one stake rather than opening a second in the same raise', async () => {
    const account = await resetAccount(investor, 'practice')
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(20_000), idempotencyKey: 'add-1',
    })
    const grown = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(15_000), idempotencyKey: 'add-2',
    })
    expect(grown.invested_cents).toBe(fromDollars(35_000))
    expect(await store.count('practice_positions', {
      where: { account_id: account.id, status: 'active' },
    })).toBe(1)
    expect(await balanceFor(account.id)).toBe(fromDollars(65_000))
  })

  it('refuses an entry that moves nothing', async () => {
    const account = (await accountFor(investor, 'practice'))!
    await expect(post({
      accountId: account.id, environment: 'practice', type: 'adjustment',
      amount: cents(0), description: 'nothing', idempotencyKey: 'zero',
    })).rejects.toThrow()
  })

  it('caps how much virtual cash one account may hold', async () => {
    await resetAccount(investor, 'practice')
    await expect(addCash(investor, 'practice', cents(MAX_VIRTUAL_BALANCE_CENTS)))
      .rejects.toThrow(/at most/i)
  })

  it('refuses to remove more virtual cash than is there', async () => {
    await resetAccount(investor, 'practice')
    await expect(withdrawCash(investor, 'practice', fromDollars(200_000)))
      .rejects.toThrow(/more than the virtual cash/i)
  })
})

// ---------------------------------------------------------------------------

describe('what a practice investor may reach', () => {
  it('refuses to practise against a raise that is not open', async () => {
    await expect(invest(investor, 'practice', {
      offeringId: closedOffering.id, amount: fromDollars(25_000), idempotencyKey: 'closed-1',
    })).rejects.toThrow(/no longer open/i)
  })

  it('refuses an offering the investor could not see in the live product', async () => {
    const draft = await createOffering(sponsor, deal.id, {
      name: 'Unpublished', offering_type: 'reg_d_506b',
      issuer_entity: 'X LLC', target_raise: 1_000_000, minimum_investment: 10_000,
      terms: { capital_position: 'common_equity', target_hold_months: 60 },
    })
    await expect(invest(investor, 'practice', {
      offeringId: draft.id, amount: fromDollars(25_000), idempotencyKey: 'draft-1',
    })).rejects.toThrow(/could not be found/i)
  })

  it('refuses an offering that does not exist', async () => {
    await expect(invest(investor, 'practice', {
      offeringId: '00000000-0000-0000-0000-000000000000',
      amount: fromDollars(25_000), idempotencyKey: 'ghost-1',
    })).rejects.toThrow(/could not be found/i)
  })

  it('will not simulate against another person\'s holding', async () => {
    await resetAccount(investor, 'practice')
    const mine = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'mine-1',
    })
    await ensureAccount(other, 'practice')
    await expect(simulateDistribution(other, 'practice', mine.id))
      .rejects.toThrow(/not in this account/i)
    await expect(simulateExit(other, 'practice', mine.id))
      .rejects.toThrow(/not in this account/i)
  })

  it('will not simulate an exited holding twice', async () => {
    await resetAccount(investor, 'practice')
    const position = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'twice-1',
    })
    await simulateExit(investor, 'practice', position.id)
    await expect(simulateExit(investor, 'practice', position.id))
      .rejects.toThrow(/already been exited/i)
    await expect(simulateDistribution(investor, 'practice', position.id))
      .rejects.toThrow(/already been exited/i)
  })
})

// ---------------------------------------------------------------------------

describe('the two sandboxes do not mix', () => {
  it('gives one person a separate account and balance in each', async () => {
    const practice = await ensureAccount(investor, 'practice')
    const demo = await ensureAccount(investor, 'demo')
    expect(demo.id).not.toBe(practice.id)
    expect(await balanceFor(demo.id)).toBe(OPENING_BALANCE_CENTS.demo)
    expect(await balanceFor(practice.id)).not.toBe(await balanceFor(demo.id))
  })

  it('keeps a demo investment out of the practice portfolio', async () => {
    const demo = await ensureAccount(investor, 'demo')
    await invest(investor, 'demo', {
      offeringId: offering.id, amount: fromDollars(50_000), idempotencyKey: 'demo-side',
    })
    const practice = (await accountFor(investor, 'practice'))!
    const [demoPortfolio, practicePortfolio] = await Promise.all([
      portfolioFor(demo.id), portfolioFor(practice.id),
    ])
    expect(demoPortfolio.investedCents).toBe(fromDollars(50_000))
    expect(demoPortfolio.holdings.every((h) => h.position.environment === 'demo')).toBe(true)
    expect(practicePortfolio.holdings.every((h) => h.position.environment === 'practice')).toBe(true)
  })

  it('resets one without touching the other', async () => {
    const demoBefore = await balanceFor((await accountFor(investor, 'demo'))!.id)
    await resetAccount(investor, 'practice')
    expect(await balanceFor((await accountFor(investor, 'demo'))!.id)).toBe(demoBefore)
  })
})

// ---------------------------------------------------------------------------

describe('one person cannot read or spend another\'s sandbox', () => {
  it('gives each person their own account', async () => {
    const mine = await ensureAccount(investor, 'practice')
    const theirs = await ensureAccount(other, 'practice')
    expect(mine.id).not.toBe(theirs.id)
    expect(mine.user_id).toBe(investor.user.id)
    expect(theirs.user_id).toBe(other.user.id)
  })

  it('does not show one person the other\'s holdings', async () => {
    await resetAccount(investor, 'practice')
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(40_000), idempotencyKey: 'privacy-1',
    })
    const theirs = (await accountFor(other, 'practice'))!
    const portfolio = await portfolioFor(theirs.id)
    expect(portfolio.holdings).toHaveLength(0)
    expect(await positionIn(theirs.id, offering.id)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('the arithmetic', () => {
  it('reports no hypothetical rate until something has been paid back', async () => {
    const account = await resetAccount(investor, 'practice')
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'irr-1',
    })
    const before = await portfolioFor(account.id)
    // A portfolio that has only ever spent has an IRR of -100%, which is true
    // and useless. It reports nothing instead.
    expect(before.hypotheticalIrrPct).toBeNull()
    expect(before.hypotheticalMultiple).toBe(0)
  })

  it('measures the hypothetical rate in simulated periods, not wall-clock time', async () => {
    const account = (await accountFor(investor, 'practice'))!
    const position = (await portfolioFor(account.id)).holdings[0]!.position
    for (let quarter = 0; quarter < 4; quarter++) {
      await simulateDistribution(investor, 'practice', position.id)
    }
    const portfolio = await portfolioFor(account.id)
    // Four quarters simulated in milliseconds. Dated by the clock this would
    // be a rate in the millions of percent; dated by period it is a plausible
    // annual figure.
    expect(portfolio.hypotheticalIrrPct).not.toBeNull()
    expect(Math.abs(portfolio.hypotheticalIrrPct!)).toBeLessThan(100)
  })

  it('scores diversification against the stated rule and nothing else', async () => {
    const account = await resetAccount(investor, 'practice')
    const empty = diversification(await portfolioFor(account.id))
    expect(empty.score).toBe(0)
    expect(empty.rules.every((rule) => !rule.met)).toBe(true)

    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(50_000), idempotencyKey: 'div-1',
    })
    const one = diversification(await portfolioFor(account.id))
    // Everything with one sponsor in one state: two rules broken by definition.
    expect(one.rules.find((r) => r.key === 'sponsor')!.met).toBe(false)
    expect(one.rules.find((r) => r.key === 'state')!.met).toBe(false)
    expect(one.rules.find((r) => r.key === 'count')!.met).toBe(false)
  })

  it('keeps every amount in whole cents', async () => {
    const account = await resetAccount(investor, 'practice')
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(10_000.57), idempotencyKey: 'cents-1',
    })
    const entries = await entriesFor(account.id)
    for (const entry of entries) expect(Number.isInteger(entry.amount_cents)).toBe(true)
    expect(await balanceFor(account.id)).toBe(fromDollars(89_999.43))
  })
})

// ---------------------------------------------------------------------------

describe('the environment is decided by the server', () => {
  it('has no argument that makes a sandbox call touch the live account', async () => {
    // There is no `environment: "live"` to pass: the type admits only the two
    // sandboxes, and the resolver that produces it reads a signed cookie. This
    // asserts the runtime consequence — that after every sandbox operation the
    // production money tables are still empty.
    await resetAccount(investor, 'practice')
    await addCash(investor, 'practice', fromDollars(50_000))
    await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'env-1',
    })
    await withdrawCash(investor, 'practice', fromDollars(1_000))

    expect(await store.count('cash_ledger_entries', {})).toBe(0)
    expect(await store.count('investor_accounts', {})).toBe(0)
    expect(await store.count('investment_orders', {})).toBe(0)
  })

  it('refuses an unknown environment at the type and the flag', async () => {
    // Cast through unknown to simulate a caller that ignored the type.
    await expect(
      ensureAccount(investor, 'live' as unknown as 'practice'),
    ).rejects.toThrow(PracticeError)
  })
})

// ---------------------------------------------------------------------------

describe('the boundary is structural, not a matter of discipline', () => {
  /**
   * The sandbox's guarantee is that it cannot move real money, and the reason
   * it cannot is that the functions which could are not in scope in any file
   * that runs there. That is a property of the imports, so it is checked
   * against the imports rather than inferred from behaviour — a behavioural
   * test passes right up until somebody adds the import.
   */
  const FORBIDDEN = [
    '@/services/accounts/accounts',
    '@/services/accounts/ledger',
    '@/services/accounts/orders',
    '@/services/accounts/providers',
    '@/services/equity/commitments',
    '@/services/equity/distributions',
    '@/services/billing',
  ]

  it('imports no production money service anywhere under services/practice', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(process.cwd(), 'services', 'practice')

    const offences: string[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(dir, file), 'utf8')
      for (const forbidden of FORBIDDEN) {
        if (source.includes(`from '${forbidden}'`)) offences.push(`${file} imports ${forbidden}`)
      }
    }
    expect(offences).toEqual([])
  })

  it('imports no production money service anywhere under the sandbox routes', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry)
        return statSync(full).isDirectory()
          ? walk(full)
          : /\.tsx?$/.test(entry) ? [full] : []
      })

    const offences: string[] = []
    for (const file of walk(join(process.cwd(), 'app', '(app)', 'sandbox'))) {
      const source = readFileSync(file, 'utf8')
      for (const forbidden of FORBIDDEN) {
        if (source.includes(`from '${forbidden}'`)) offences.push(`${file} imports ${forbidden}`)
      }
    }
    expect(offences).toEqual([])
  })

  it('writes to no table outside the sandbox namespace', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(process.cwd(), 'services', 'practice')

    // Every `store.insert('x'`, `store.update('x'`, `store.remove('x'` and
    // `store.updateWhere('x'` in the sandbox services, whatever the table.
    const writes = /store\.(insert|insertMany|update|updateWhere|remove)\(\s*'([a-z_]+)'/g
    const tables = new Set<string>()
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(dir, file), 'utf8')
      for (const match of source.matchAll(writes)) tables.add(match[2]!)
    }

    expect([...tables].sort()).toEqual([
      'practice_accounts', 'practice_activity', 'practice_ledger_entries',
      'practice_positions', 'practice_resets',
    ])
  })
})

// ---------------------------------------------------------------------------

describe('the hypothetical rate', () => {
  it('does not report a total loss on a holding that is merely unsold', async () => {
    const account = await resetAccount(investor, 'practice')
    const position = await invest(investor, 'practice', {
      offeringId: offering.id, amount: fromDollars(50_000), idempotencyKey: 'rate-1',
    })
    await simulateDistribution(investor, 'practice', position.id)

    const portfolio = await portfolioFor(account.id)
    // One profitable quarter into a five-year hold. Without a terminal value
    // the arithmetic reports -100% a year, which is true of the two flows and
    // false about the investment.
    expect(portfolio.hypotheticalIrrPct).not.toBeNull()
    expect(portfolio.hypotheticalIrrPct!).toBeGreaterThan(0)
  })

  it('carries an unsold holding at cost rather than at any estimate', async () => {
    const account = (await accountFor(investor, 'practice'))!
    const portfolio = await portfolioFor(account.id)
    // Account value is cash plus cost. Nothing marks the holding up.
    expect(portfolio.accountValueCents).toBe(portfolio.cashCents + fromDollars(50_000))
  })
})
