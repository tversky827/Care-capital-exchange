import { beforeAll, describe, expect, it } from 'vitest'
import { attachInvestor, createActor, installTestStore } from './helpers/harness'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'
import type { Offering } from '@/types/equity'

import { createDeal } from '@/services/deals'
import { createOffering, publishOffering } from '@/services/equity/offerings'
import { searchOfferings } from '@/services/equity/matching'
import { ndaApplies } from '@/services/equity/nda'
import { catalogueFor, inCatalogue } from '@/lib/catalogue'
import {
  advanceOnboarding, createInvestorProfile, requestVerification, setVerificationStatus,
  updatePreferences,
} from '@/services/equity/investors'

/**
 * Catalogue tests.
 *
 * The demonstration catalogue is fictional and the live one is not, so the
 * failure that matters is a read leaking across: an invented raise appearing
 * in the real marketplace, where somebody would read made-up figures with
 * nothing on the page to say so.
 */

let store: Store
let sponsor: Actor
let admin: Actor
let investor: Actor
let liveDeal: Deal
let demoDeal: Deal
let liveOffering: Offering
let demoOffering: Offering

async function makeDeal(name: string): Promise<Deal> {
  const deal = await createDeal({
    actor: sponsor,
    name,
    assetType: 'snf',
    transactionType: 'acquisition',
    borrowerPriority: 'lowest_rate',
    facility: {
      name, city: 'Chicago', state: 'IL',
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
  return deal
}

async function makeOffering(deal: Deal, name: string): Promise<Offering> {
  const created = await createOffering(sponsor, deal.id, {
    name,
    offering_type: 'reg_d_506b',
    issuer_entity: 'Holdings LLC',
    target_raise: 8_000_000,
    minimum_investment: 10_000,
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
  return publishOffering(admin, created.id)
}

beforeAll(async () => {
  store = await installTestStore()
  admin = await createActor(store, {
    email: 'admin@cat.test', name: 'Admin', companyName: 'CareCapital',
    companyType: 'admin', role: 'admin',
  })
  sponsor = await createActor(store, {
    email: 'sponsor@cat.test', name: 'Sponsor', companyName: 'Meridian',
    companyType: 'borrower', role: 'borrower',
  })
  const raw = await createActor(store, {
    email: 'investor@cat.test', name: 'Investor', companyName: 'Investments',
    companyType: 'investor', role: 'investor',
  })
  await createInvestorProfile(raw, { display_name: 'Investor', investor_type: 'individual', state: 'IL' })
  let current = await attachInvestor(store, raw)
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
  investor = await attachInvestor(store, current)

  liveDeal = await makeDeal('Real Property')
  demoDeal = await makeDeal('Fictional Property')
  await store.update('deals', demoDeal.id, { environment: 'demo' } as never)

  liveOffering = await makeOffering(liveDeal, 'Real Raise')
  demoOffering = await makeOffering(demoDeal, 'Fictional Raise')
  await store.update('offerings', demoOffering.id, { environment: 'demo' } as never)
})

describe('the catalogues stay apart', () => {
  it('keeps a fictional raise out of the live marketplace', async () => {
    const live = await searchOfferings(investor.investor!.id, { status: 'all' }, 'live')
    const names = live.map((row) => row.offering.name)
    expect(names).toContain('Real Raise')
    expect(names).not.toContain('Fictional Raise')
  })

  it('keeps a real raise out of the demonstration marketplace', async () => {
    const demo = await searchOfferings(investor.investor!.id, { status: 'all' }, 'demo')
    const names = demo.map((row) => row.offering.name)
    expect(names).toContain('Fictional Raise')
    expect(names).not.toContain('Real Raise')
  })

  it('defaults to the live catalogue when no caller says otherwise', async () => {
    // The default matters more than it looks: a caller that has never heard of
    // the demonstration catalogue must not surface one by omission.
    const implied = await searchOfferings(investor.investor!.id, { status: 'all' })
    expect(implied.map((row) => row.offering.name)).not.toContain('Fictional Raise')
  })

  it('reads a row with no environment as live catalogue', () => {
    // Everything written before the column existed. A real raise mislabelled
    // as a demonstration is a real raise nobody can see.
    expect(inCatalogue({}, 'live')).toBe(true)
    expect(inCatalogue({}, 'demo')).toBe(false)
    expect(inCatalogue({ environment: null }, 'live')).toBe(true)
  })

  it('sends practice mode to the live catalogue, and only demo to the other', () => {
    expect(catalogueFor('live')).toBe('live')
    expect(catalogueFor('practice')).toBe('live')
    expect(catalogueFor('demo')).toBe('demo')
  })

  it('matches an investor only against real raises', async () => {
    const { computeMatchesForInvestor } = await import('@/services/equity/matching')
    const matches = await computeMatchesForInvestor(investor.investor!.id)
    const matched = new Set(matches.map((row) => row.offering_id))
    expect(matched.has(liveOffering.id)).toBe(true)
    expect(matched.has(demoOffering.id)).toBe(false)
  })
})

describe('confidentiality follows the catalogue', () => {
  it('asks for an agreement on a real raise', () => {
    expect(ndaApplies(investor, sponsor.company.id, 'live')).toBe(true)
  })

  it('asks for none on a fictional one', () => {
    // There is nothing to protect. Making a presenter promise nothing to
    // nobody mid-demonstration teaches that the agreement is a formality.
    expect(ndaApplies(investor, sponsor.company.id, 'demo')).toBe(false)
  })

  it('still asks the operator for nothing on their own raise', () => {
    expect(ndaApplies(sponsor, sponsor.company.id, 'live')).toBe(false)
  })
})
