import { beforeAll, describe, expect, it } from 'vitest'
import { attachInvestor, createActor, installTestStore } from './helpers/harness'
import { fromDollars } from '@/lib/money'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'
import type { Offering } from '@/types/equity'

import { createDeal } from '@/services/deals'
import { createOffering, publishOffering } from '@/services/equity/offerings'
import { recordInterest } from '@/services/equity/commitments'
import { acceptNda } from '@/services/equity/nda'
import {
  advanceOnboarding, createInvestorProfile, setVerificationStatus, requestVerification,
  updatePreferences,
} from '@/services/equity/investors'
import { deposit, openAccount, runChecks, withdraw } from '@/services/accounts/accounts'
import { balanceFor, spendableFor } from '@/services/accounts/ledger'
import { cancelOrder, canTransition, confirmOrder, placeOrder, settleOrder } from '@/services/accounts/orders'
import { ORDER_STATUSES, TERMINAL_ORDER_STATUSES } from '@/types/accounts'

/**
 * Order tests.
 *
 * The first block is the journey the product exists for: fund an account,
 * invest from it, watch the cash move, receive a distribution, invest again.
 * Everything after it is an attempt to break that journey.
 */

let store: Store
let sponsor: Actor
let admin: Actor
let investor: Actor
let deal: Deal
let offering: Offering
let accountId: string

/** Mirrors the onboarding an investor completes before they can transact. */
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

/** Confirms an order the way the ticket does: acknowledging the disclosures. */
async function confirm(actor: Actor, orderId: string) {
  const order = await store.findById('investment_orders', orderId)
  const required = (await store.select('offering_disclosures', {
    where: { offering_id: order!.offering_id },
  })).filter((d) => d.required).map((d) => d.id)
  return confirmOrder(actor, orderId, required)
}

beforeAll(async () => {
  store = await installTestStore()
  admin = await createActor(store, {
    email: 'admin@orders.test', name: 'Admin', companyName: 'CareCapital',
    companyType: 'admin', role: 'admin',
  })
  sponsor = await createActor(store, {
    email: 'sponsor@orders.test', name: 'Sponsor', companyName: 'Meridian',
    companyType: 'borrower', role: 'borrower',
  })
  const raw = await createActor(store, {
    email: 'michael@orders.test', name: 'Michael Demo', companyName: 'Michael Demo Investments',
    companyType: 'investor', role: 'investor',
  })
  investor = await onboard(raw, 'Michael Demo')

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

  // A published offering needs underwritten income behind it, which needs a
  // period of actuals. Written here the way the seed writes them, so the test
  // exercises the same publication checks a real raise passes.
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

  offering = await createOffering(sponsor, deal.id, {
    name: 'Chicago Senior Care Equity',
    offering_type: 'reg_d_506b',
    issuer_entity: 'Meridian Chicago Holdings LLC',
    target_raise: 8_000_000,
    minimum_investment: 10_000,
    maximum_investment: 500_000,
    terms: {
      capital_position: 'common_equity',
      target_hold_months: 60,
      assumptions: {
        hold_years: 5, exit_cap_rate_pct: 11, exit_multiple_of_ebitda: null,
        revenue_growth_pct: 3, expense_growth_pct: 3, occupancy_stabilized_pct: 88,
        capex_per_bed: 420, selling_costs_pct: 2, notes: null,
      },
    },
  })
  offering = await publishOffering(admin, offering.id)

  // The agreement, the interest and the account: everything the product asks
  // for before an order can exist.
  await acceptNda(investor, offering.id, 'Michael Demo')
  await recordInterest(investor, offering.id, { indicatedAmount: 25_000 })
  const account = await openAccount(investor, { accountType: 'individual', legalName: 'Michael Demo' })
  await runChecks(investor, account.id)
  accountId = account.id
})

describe('the journey the product exists for', () => {
  it('funds an account, invests from it, and settles into a position', async () => {
    // Fund once.
    await deposit(investor, fromDollars(125_000))
    expect(await spendableFor(accountId)).toBe(fromDollars(125_000))

    // Invest.
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'demo-order-1',
    })
    expect(order.status).toBe('pending_confirmation')
    // At placement the disclosures are still outstanding by design; they are
    // acknowledged in the ticket. The order records what was true then.
    expect(order.eligibility_verdict).toBe('needs_information')

    // Confirming reserves the cash but does not spend it yet.
    const confirmed = await confirm(investor, order.id)
    expect(confirmed.status).toBe('accepted')
    expect(confirmed.eligibility_verdict).toBe('eligible')
    const reserved = await balanceFor(accountId)
    expect(reserved.available_cents).toBe(fromDollars(125_000))
    expect(reserved.pending_outgoing_cents).toBe(fromDollars(25_000))
    expect(await spendableFor(accountId)).toBe(fromDollars(100_000))

    // Settling spends it and creates the holding.
    const settled = await settleOrder(order.id)
    expect(settled.status).toBe('settled')
    expect(settled.position_id).toBeTruthy()
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(100_000))

    const position = await store.findById('investment_positions', settled.position_id!)
    expect(position!.invested_amount).toBe(25_000)

    // And the offering's raised total moved by exactly that amount.
    const after = await store.findById('offerings', offering.id)
    expect(after!.committed_amount).toBe(25_000)
  })

  it('deploys the same funded cash into a second investment', async () => {
    const second = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(15_000), idempotencyKey: 'demo-order-2',
    })
    await confirm(investor, second.id)
    await settleOrder(second.id)
    // 125k funded, 40k deployed across two investments, no second transfer.
    expect((await balanceFor(accountId)).available_cents).toBe(fromDollars(85_000))
  })

  it('turns a distribution into cash that can be invested again', async () => {
    const before = await spendableFor(accountId)
    const { post } = await import('@/services/accounts/ledger')
    const cash = await store.selectOne('cash_accounts', { where: { account_id: accountId } })
    await post({
      accountId, cashAccountId: cash!.id, type: 'distribution_credit',
      amount: fromDollars(1_850), description: 'Q2 distribution — Chicago Senior Care',
      idempotencyKey: 'dist-q2', referenceType: 'distribution',
    })
    expect(await spendableFor(accountId)).toBe(before + fromDollars(1_850))
  })
})

describe('an order cannot skip the machine', () => {
  it('allows only the transitions the machine defines', () => {
    expect(canTransition('draft', 'eligibility_check')).toBe(true)
    expect(canTransition('draft', 'settled')).toBe(false)
    expect(canTransition('pending_confirmation', 'settled')).toBe(false)
    expect(canTransition('accepted', 'settling')).toBe(true)
    expect(canTransition('rejected', 'accepted')).toBe(false)
  })

  it('lets nothing out of a terminal state', () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      for (const target of ORDER_STATUSES) {
        expect(canTransition(status, target)).toBe(false)
      }
    }
  })

  it('refuses to settle an order that was never confirmed', async () => {
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'unconfirmed',
    })
    await expect(settleOrder(order.id)).rejects.toThrow(/cannot become/)
    await cancelOrder(investor, order.id, 'Test cleanup.')
  })

  it('refuses to confirm without acknowledging the risk disclosures', async () => {
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'no-ack',
    })
    await expect(confirmOrder(investor, order.id, []))
      .rejects.toThrow(/Acknowledge the risk disclosures/)
    await cancelOrder(investor, order.id, 'Test cleanup.')
  })

  it('refuses to confirm an order twice', async () => {
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'confirm-twice',
    })
    await confirm(investor, order.id)
    await expect(confirmOrder(investor, order.id, []))
      .rejects.toThrow(/not waiting for confirmation/)
    await cancelOrder(investor, order.id, 'Test cleanup.')
  })
})

describe('an order cannot spend money that is not there', () => {
  it('refuses an amount larger than the available cash', async () => {
    const spendable = await spendableFor(accountId)
    await expect(placeOrder(investor, {
      offeringId: offering.id, amount: (spendable + fromDollars(1)) as never,
      idempotencyKey: 'too-big',
    })).rejects.toThrow(/available and this order is/)
  })

  it('will not let two orders commit the same cash', async () => {
    const spendable = await spendableFor(accountId)
    const half = Math.floor(spendable / 2) + 100
    const a = await placeOrder(investor, {
      offeringId: offering.id, amount: half as never, idempotencyKey: 'half-a',
    })
    await confirm(investor, a.id)
    // The first order's reservation has already taken it out of spendable.
    await expect(placeOrder(investor, {
      offeringId: offering.id, amount: half as never, idempotencyKey: 'half-b',
    })).rejects.toThrow(/available and this order is/)
    await cancelOrder(investor, a.id, 'Test cleanup.')
  })

  it('returns the reservation when an order is cancelled', async () => {
    const before = await spendableFor(accountId)
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(20_000), idempotencyKey: 'cancel-me',
    })
    await confirm(investor, order.id)
    expect(await spendableFor(accountId)).toBe(before - fromDollars(20_000))
    await cancelOrder(investor, order.id, 'Changed my mind.')
    expect(await spendableFor(accountId)).toBe(before)
  })
})

describe('an order cannot be placed by the wrong person or on the wrong thing', () => {
  it('refuses an amount below the offering minimum', async () => {
    await expect(placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(500), idempotencyKey: 'too-small',
    })).rejects.toThrow(/minimum investment/)
  })

  it('refuses an amount above the offering maximum', async () => {
    await expect(placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(600_000), idempotencyKey: 'too-large',
    })).rejects.toThrow(/maximum investment/)
  })

  it('refuses an investor who has not signed the confidentiality agreement', async () => {
    const raw = await createActor(store, {
      email: 'nosign@orders.test', name: 'No Sign', companyName: 'No Sign Ltd',
      companyType: 'investor', role: 'investor',
    })
    const other = await onboard(raw, 'No Sign Ltd')
    const account = await openAccount(other, { accountType: 'individual', legalName: 'No Sign Ltd' })
    await runChecks(other, account.id)
    await deposit(other, fromDollars(50_000))
    await expect(placeOrder(other, {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'unsigned',
    })).rejects.toThrow(/confidentiality/i)
  })

  it('refuses an account that has not passed its checks', async () => {
    const raw = await createActor(store, {
      email: 'unchecked@orders.test', name: 'Unchecked', companyName: 'Unchecked Ltd',
      companyType: 'investor', role: 'investor',
    })
    const other = await onboard(raw, 'Unchecked Ltd')
    await openAccount(other, { accountType: 'individual', legalName: 'Unchecked Ltd' })
    // Checks deliberately not run.
    await expect(placeOrder(other, {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'unchecked',
    })).rejects.toThrow(/cannot transact yet/)
  })

  it('refuses a sponsor trying to invest in their own raise from an account', async () => {
    await expect(placeOrder(sponsor, {
      offeringId: offering.id, amount: fromDollars(25_000), idempotencyKey: 'sponsor-order',
    })).rejects.toThrow()
  })

  it('will not let one investor confirm another investor’s order', async () => {
    const order = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'mine-not-yours',
    })
    const raw = await createActor(store, {
      email: 'thief@orders.test', name: 'Thief', companyName: 'Thief Ltd',
      companyType: 'investor', role: 'investor',
    })
    const thief = await onboard(raw, 'Thief Ltd')
    const account = await openAccount(thief, { accountType: 'individual', legalName: 'Thief Ltd' })
    await runChecks(thief, account.id)
    await expect(confirm(thief, order.id))
      .rejects.toThrow(/belongs to another account/)
    await cancelOrder(investor, order.id, 'Test cleanup.')
  })
})

describe('the same instruction never places two orders', () => {
  it('returns the existing order for a repeated key', async () => {
    const first = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'once-only',
    })
    const second = await placeOrder(investor, {
      offeringId: offering.id, amount: fromDollars(10_000), idempotencyKey: 'once-only',
    })
    expect(second.id).toBe(first.id)
    await cancelOrder(investor, first.id, 'Test cleanup.')
  })
})

describe('withdrawals', () => {
  it('cannot take out more than is there', async () => {
    const spendable = await spendableFor(accountId)
    await expect(withdraw(investor, (spendable + fromDollars(1)) as never))
      .rejects.toThrow(/enough available cash/)
  })

  it('reserves the cash immediately so it cannot also be invested', async () => {
    const before = await spendableFor(accountId)
    await withdraw(investor, fromDollars(5_000))
    expect(await spendableFor(accountId)).toBe(before - fromDollars(5_000))
  })
})
