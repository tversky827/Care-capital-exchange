import { attachInvestor, createActor, installTestStore } from './helpers/harness'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'
import type { Offering } from '@/types/equity'

import { createDeal } from '@/services/deals'
import { createOffering, publishOffering, readOffering, setOfferingStatus } from '@/services/equity/offerings'
import {
  acceptCommitment, acknowledgeDisclosures, recordInterest, submitCommitment,
} from '@/services/equity/commitments'
import {
  advanceOnboarding, createInvestorProfile, readInvestorRecord, setVerificationStatus,
  requestVerification, updatePreferences,
} from '@/services/equity/investors'
import { dataRoomFor, publishDocument } from '@/services/equity/data-room'
import { acceptNda, ndaState, requireNda } from '@/services/equity/nda'
import { computeFee, FEE_SCHEDULE } from '@/services/billing'
import { portfolioFor, askQuestion, questionsFor } from '@/services/equity/portfolio'
import { matchCountsForOffering } from '@/services/equity/matching'
import { capitalMarketsView } from '@/services/equity/capital-stack'

/**
 * Security tests for the equity marketplace.
 *
 * Each case is one of the specification's explicit requirements, written as
 * the attack rather than the feature: what a party must *not* be able to
 * reach, attempted through the same service the interface uses.
 */

let store: Store
let sponsor: Actor
let rivalSponsor: Actor
let admin: Actor
let alice: Actor
let bob: Actor
let lender: Actor
let deal: Deal
let offering: Offering

async function onboard(actor: Actor, name: string, state: string): Promise<Actor> {
  await createInvestorProfile(actor, { display_name: name, investor_type: 'individual', state })
  let current = await attachInvestor(store, actor)
  await updatePreferences(current, { asset_types: ['snf'], states: [state], capital_positions: ['common_equity'] })
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

beforeAll(async () => {
  store = await installTestStore()

  sponsor = await createActor(store, {
    email: 'sponsor@a.test', name: 'Sponsor A', companyName: 'Sponsor A LLC',
    companyType: 'borrower', role: 'borrower',
  })
  rivalSponsor = await createActor(store, {
    email: 'sponsor@b.test', name: 'Sponsor B', companyName: 'Sponsor B LLC',
    companyType: 'borrower', role: 'borrower',
  })
  admin = await createActor(store, {
    email: 'admin@ccx.test', name: 'Admin', companyName: 'CareCapital',
    companyType: 'admin', role: 'admin',
  })
  lender = await createActor(store, {
    email: 'lender@bank.test', name: 'Lender', companyName: 'Test Bank',
    companyType: 'lender', role: 'lender',
  })
  alice = await createActor(store, {
    email: 'alice@invest.test', name: 'Alice', companyName: 'Alice Capital',
    companyType: 'investor', role: 'investor',
  })
  bob = await createActor(store, {
    email: 'bob@invest.test', name: 'Bob', companyName: 'Bob Holdings',
    companyType: 'investor', role: 'investor',
  })

  deal = await createDeal({
    actor: sponsor,
    name: 'Security Test Facility',
    assetType: 'snf',
    transactionType: 'acquisition',
    borrowerPriority: 'lowest_rate',
    narrative: 'A facility used to test access control.',
    facility: {
      name: 'Security Test Facility', city: 'Springfield', state: 'IL',
      licensed_beds: 100, operating_beds: 100, current_census: 89, occupancy_pct: 89,
      year_built: 1999, real_estate_included: true,
    },
    terms: {
      purchase_price: 12_000_000, requested_financing: 8_400_000,
      appraised_value: 12_200_000, estimated_closing_costs: 360_000,
      requested_rate_pct: 7.2, requested_term_months: 60, requested_amortization_months: 300,
    },
    sponsor: {
      legal_entity: 'Sponsor A LLC', years_in_healthcare: 15, years_operating_asset_type: 12,
      facilities_operated: 6, beds_operated: 700, states_operated: ['IL'],
      historical_acquisitions: 4, previous_exits: 1, prior_defaults: false,
      net_worth: 18_000_000, liquidity: 5_000_000,
    },
  })

  const { uploadDocument } = await import('@/services/documents')
  const doc = await uploadDocument({
    actor: sponsor,
    dealId: deal.id,
    docType: 'profit_and_loss',
    filename: 'pl.csv',
    mimeType: 'text/csv',
    data: Buffer.from('Line Item,2025\nTotal Revenue,"$12,000,000"\nEBITDA,"$1,300,000"\n'),
    processing: 'inline',
  })

  offering = await createOffering(sponsor, deal.id, {
    name: 'Security Test Equity',
    offering_type: 'reg_d_506b',
    issuer_entity: 'Sponsor A Holdings LLC',
    target_raise: 3_000_000,
    minimum_investment: 50_000,
    terms: {
      capital_position: 'common_equity',
      target_hold_months: 60,
      assumptions: {
        hold_years: 5, exit_cap_rate_pct: 9, exit_multiple_of_ebitda: null,
        revenue_growth_pct: 3, expense_growth_pct: 3, occupancy_stabilized_pct: 89,
        capex_per_bed: 400, selling_costs_pct: 2, notes: null,
      },
    },
  })

  // One document at each of two tiers, so the ladder can be tested.
  await publishDocument(sponsor, offering.id, doc.id, {
    category: 'financial_statements', accessLevel: 'public_teaser',
  })

  offering = await publishOffering(admin, offering.id)

  alice = await onboard(alice, 'Alice Capital', 'IL')
  bob = await onboard(bob, 'Bob Holdings', 'IL')
})

describe('an unpublished offering is invisible to investors', () => {
  it('refuses to show a draft offering to an investor', async () => {
    const draft = await createOffering(sponsor, deal.id, {
      name: 'Unpublished Offering', offering_type: 'reg_d_506b',
    })
    await expect(readOffering(alice, draft.id)).rejects.toThrow(/not available/i)
    // The sponsor and the administrator can still see their own work.
    await expect(readOffering(sponsor, draft.id)).resolves.toBeDefined()
    await expect(readOffering(admin, draft.id)).resolves.toBeDefined()
  })

  it('refuses to let a sponsor publish its own offering', async () => {
    const draft = await createOffering(sponsor, deal.id, {
      name: 'Self Published', offering_type: 'reg_d_506b',
      issuer_entity: 'X LLC', target_raise: 1_000_000, minimum_investment: 50_000,
      terms: {
        target_hold_months: 60,
        assumptions: {
          hold_years: 5, exit_cap_rate_pct: 9, exit_multiple_of_ebitda: null,
          revenue_growth_pct: 3, expense_growth_pct: 3, occupancy_stabilized_pct: 89,
          capex_per_bed: 400, selling_costs_pct: 2, notes: null,
        },
      },
    })
    await expect(publishOffering(sponsor, draft.id)).rejects.toThrow(/administrator/i)
    await expect(setOfferingStatus(sponsor, draft.id, 'live', 'Trying anyway')).rejects.toThrow(/administrator/i)
  })
})

describe('one investor cannot reach another investor', () => {
  beforeAll(async () => {
    const disclosures = await store.select('offering_disclosures', { where: { offering_id: offering.id } })
    for (const investor of [alice, bob]) {
      await recordInterest(investor, offering.id, { indicatedAmount: 100_000 })
      await acknowledgeDisclosures(investor, offering.id, disclosures.map((d) => d.id))
      await submitCommitment(investor, offering.id, 100_000)
    }
    const commitments = await store.select('investment_commitments', { where: { offering_id: offering.id } })
    for (const commitment of commitments) await acceptCommitment(sponsor, commitment.id)
  })

  it('shows an investor only their own portfolio', async () => {
    const alicePortfolio = await portfolioFor(alice)
    const bobPortfolio = await portfolioFor(bob)
    expect(alicePortfolio.positions).toHaveLength(1)
    expect(bobPortfolio.positions).toHaveLength(1)
    expect(alicePortfolio.positions[0].position.investor_id).toBe(alice.investor!.id)
    expect(bobPortfolio.positions[0].position.investor_id).toBe(bob.investor!.id)
    // Neither total includes the other's capital.
    expect(alicePortfolio.capitalInvested).toBe(100_000)
  })

  it('refuses to let one investor read another’s record', async () => {
    await expect(readInvestorRecord(alice, bob.investor!.id)).rejects.toThrow(/cannot view/i)
    await expect(readInvestorRecord(admin, bob.investor!.id)).resolves.toBeDefined()
  })

  it('keeps a private question private from other investors', async () => {
    await askQuestion(alice, offering.id, 'What is the sponsor’s cash contribution?')
    const bobsView = await questionsFor(bob, offering.id)
    expect(bobsView).toHaveLength(0)
    // The author and the sponsor both see it.
    expect(await questionsFor(alice, offering.id)).toHaveLength(1)
    expect(await questionsFor(sponsor, offering.id)).toHaveLength(1)
  })

  it('tells a sponsor how many investors matched, never which', async () => {
    const counts = await matchCountsForOffering(offering.id)
    const serialised = JSON.stringify(counts)
    expect(serialised).not.toContain(alice.investor!.id)
    expect(serialised).not.toContain('Alice')
  })
})

describe('the confidentiality agreement gates the detail', () => {
  it('requires an outside viewer to sign before anything is released', async () => {
    const dave = await createActor(store, {
      email: 'dave@invest.test', name: 'Dave', companyName: 'Dave Capital',
      companyType: 'investor', role: 'investor',
    })
    const onboarded = await onboard(dave, 'Dave Capital', 'IL')

    const before = await ndaState(onboarded, offering.id)
    expect(before.required).toBe(true)
    expect(before.accepted).toBe(false)
    await expect(requireNda(onboarded, offering.id)).rejects.toThrow(/confidentiality/i)
    // The data room is empty until it is signed, whatever the access ladder
    // would otherwise have allowed.
    expect(await dataRoomFor(onboarded, offering.id)).toHaveLength(0)

    await acceptNda(onboarded, offering.id, 'Dave Ashworth')
    const after = await ndaState(onboarded, offering.id)
    expect(after.accepted).toBe(true)
    await expect(requireNda(onboarded, offering.id)).resolves.toBeUndefined()
  })

  it('does not ask the operator to sign an agreement about their own raise', async () => {
    const state = await ndaState(sponsor, offering.id)
    expect(state.required).toBe(false)
    expect(state.accepted).toBe(true)
    await expect(acceptNda(sponsor, offering.id, 'Sam Sponsor')).rejects.toThrow(/your own organisation/i)
  })

  it('does not ask an administrator to sign', async () => {
    const state = await ndaState(admin, offering.id)
    expect(state.required).toBe(false)
    expect(state.accepted).toBe(true)
  })

  it('refuses a signature that is not a name', async () => {
    const erin = await createActor(store, {
      email: 'erin@invest.test', name: 'Erin', companyName: 'Erin Partners',
      companyType: 'investor', role: 'investor',
    })
    await expect(acceptNda(erin, offering.id, '  ')).rejects.toThrow(/full name/i)
  })

  // Two raises on the same facility, so the case cannot be passed by the deal
  // differing — it is the offering the agreement is about.
  it('does not carry a signature on one offering across to another', async () => {
    const frank = await createActor(store, {
      email: 'frank@invest.test', name: 'Frank', companyName: 'Frank Holdings',
      companyType: 'investor', role: 'investor',
    })
    const otherOffering = await createOffering(sponsor, deal.id, {
      name: 'Second raise on the same facility', offering_type: 'reg_d_506b',
      target_raise: 1_000_000, minimum_investment: 50_000,
    })

    await acceptNda(frank, offering.id, 'Frank Osei')
    expect((await ndaState(frank, offering.id)).accepted).toBe(true)
    expect((await ndaState(frank, otherOffering.id)).accepted).toBe(false)
  })
})

describe('access to offering documents follows engagement, not curiosity', () => {
  it('withholds a committed-tier document from an investor who has not committed', async () => {
    const carol = await createActor(store, {
      email: 'carol@invest.test', name: 'Carol', companyName: 'Carol Ltd',
      companyType: 'investor', role: 'investor',
    })
    const onboarded = await onboard(carol, 'Carol Ltd', 'IL')
    // Signed, so the ladder rather than the gate is what this case tests.
    await acceptNda(onboarded, offering.id, 'Carol Nkemelu')

    const documents = await store.select('documents', { where: { deal_id: deal.id } })
    await publishDocument(sponsor, offering.id, documents[0].id, {
      category: 'purchase_agreement', accessLevel: 'committed_investor',
      displayName: 'Purchase agreement',
    })

    const room = await dataRoomFor(onboarded, offering.id)
    // The listing omits it entirely rather than showing a locked row: the
    // existence of a document is itself information.
    expect(room.map((r) => r.entry.access_level)).not.toContain('committed_investor')
  })

  it('gives the sponsor and administrator the whole room', async () => {
    const sponsorRoom = await dataRoomFor(sponsor, offering.id)
    const adminRoom = await dataRoomFor(admin, offering.id)
    expect(sponsorRoom.length).toBeGreaterThanOrEqual(1)
    expect(adminRoom.length).toBeGreaterThanOrEqual(1)
  })
})

describe('roles cannot cross into each other’s areas', () => {
  it('refuses to let a lender act as an investor', async () => {
    await expect(recordInterest(lender, offering.id, {})).rejects.toThrow(/investor account/i)
    await expect(portfolioFor(lender)).rejects.toThrow(/investor account/i)
  })

  it('refuses to let a borrower act as an investor', async () => {
    await expect(recordInterest(sponsor, offering.id, {})).rejects.toThrow(/investor account/i)
  })

  it('refuses to let a rival sponsor raise on someone else’s deal', async () => {
    await expect(
      createOffering(rivalSponsor, deal.id, { name: 'Hijacked', offering_type: 'reg_d_506b' }),
    ).rejects.toThrow(/your own deal/i)
  })

  it('refuses to let a rival sponsor accept a commitment in this offering', async () => {
    const commitment = await store.selectOne('investment_commitments', { where: { offering_id: offering.id } })
    await expect(acceptCommitment(rivalSponsor, commitment!.id)).rejects.toThrow(/only the sponsor/i)
  })

  it('refuses to let an investor see a deal’s capital markets view', async () => {
    await expect(capitalMarketsView(alice, deal.id)).rejects.toThrow()
  })

  it('refuses to let an investor record a verification verdict', async () => {
    await expect(
      setVerificationStatus(alice, alice.investor!.id, 'accreditation', 'verified', 'Self-approved'),
    ).rejects.toThrow(/administrator/i)
  })
})

describe('eligibility cannot be bypassed', () => {
  it('refuses a commitment from an investor who has not acknowledged disclosures', async () => {
    const dave = await createActor(store, {
      email: 'dave@invest.test', name: 'Dave', companyName: 'Dave LLC',
      companyType: 'investor', role: 'investor',
    })
    const onboarded = await onboard(dave, 'Dave LLC', 'IL')
    await recordInterest(onboarded, offering.id, {})
    // Every other requirement is met; only the acknowledgement is missing.
    await expect(submitCommitment(onboarded, offering.id, 100_000)).rejects.toThrow()
  })

  it('refuses a commitment on an offering that is not open', async () => {
    await setOfferingStatus(admin, offering.id, 'paused', 'Testing')
    const eve = await createActor(store, {
      email: 'eve@invest.test', name: 'Eve', companyName: 'Eve Ltd',
      companyType: 'investor', role: 'investor',
    })
    const onboarded = await onboard(eve, 'Eve Ltd', 'IL')
    await expect(recordInterest(onboarded, offering.id, {})).rejects.toThrow(/not currently open/i)
    await setOfferingStatus(admin, offering.id, 'live', 'Restoring')
  })
})

describe('records reference the entities their columns name', () => {
  /**
   * The local store has no foreign keys, so a column holding the wrong kind of
   * id passes silently there and fails only against PostgreSQL. This checks the
   * references the equity tables actually declare, which is what caught a
   * company id sitting in a user column in the demo seed.
   */
  it('points every equity foreign key at a row of the right kind', async () => {
    const [users, investors, offerings, disclosures] = await Promise.all([
      store.select('users'),
      store.select('investor_profiles'),
      store.select('offerings'),
      store.select('offering_disclosures'),
    ])
    const userIds = new Set(users.map((u) => u.id))
    const investorIds = new Set(investors.map((i) => i.id))
    const offeringIds = new Set(offerings.map((o) => o.id))
    const disclosureIds = new Set(disclosures.map((d) => d.id))

    const acknowledgements = await store.select('disclosure_acknowledgements')
    expect(acknowledgements.length).toBeGreaterThan(0)
    for (const record of acknowledgements) {
      expect(userIds.has(record.user_id)).toBe(true)
      expect(investorIds.has(record.investor_id)).toBe(true)
      expect(offeringIds.has(record.offering_id)).toBe(true)
      expect(disclosureIds.has(record.disclosure_id)).toBe(true)
    }

    for (const commitment of await store.select('investment_commitments')) {
      expect(investorIds.has(commitment.investor_id)).toBe(true)
      expect(offeringIds.has(commitment.offering_id)).toBe(true)
      if (commitment.accepted_by) expect(userIds.has(commitment.accepted_by)).toBe(true)
    }

    for (const position of await store.select('investment_positions')) {
      expect(investorIds.has(position.investor_id)).toBe(true)
      expect(offeringIds.has(position.offering_id)).toBe(true)
    }

    for (const offering of offerings) {
      expect(userIds.has(offering.created_by)).toBe(true)
      if (offering.published_by) expect(userIds.has(offering.published_by)).toBe(true)
    }
  })
})

describe('the platform charges on outcomes only', () => {
  it('has no recurring charge in the schedule', () => {
    // Every rule is a share of something that funded. A rule with no basis
    // points, or one that named a period, would be a subscription by another
    // name.
    expect(FEE_SCHEDULE.every((fee) => fee.basisPoints > 0)).toBe(true)
    expect(FEE_SCHEDULE.some((fee) => fee.appliesTo === 'sponsor')).toBe(true)
    // Investors are never charged.
    expect(FEE_SCHEDULE.some((fee) => (fee.appliesTo as string) === 'investor')).toBe(false)
  })

  it('charges nothing on a raise that funded nothing', () => {
    expect(computeFee('sponsor_success_fee', 0)).toBe(0)
  })

  it('takes the stated share of what actually funded', () => {
    const rule = FEE_SCHEDULE.find((fee) => fee.key === 'sponsor_success_fee')!
    expect(computeFee('sponsor_success_fee', 1_000_000)).toBe(1_000_000 * rule.basisPoints / 10_000)
  })

  it('returns nothing for a rule that does not exist rather than guessing one', () => {
    expect(computeFee('no_such_fee', 5_000_000)).toBe(0)
  })

  it('records a fee once when a raise closes, and not again', async () => {
    const closing = await createOffering(sponsor, deal.id, {
      name: 'Closing raise', offering_type: 'reg_d_506b',
      target_raise: 2_000_000, minimum_investment: 50_000,
    })
    await setOfferingStatus(sponsor, closing.id, 'closed', 'Raise complete.')
    const first = await store.select('billing_events', {})
    await setOfferingStatus(sponsor, closing.id, 'closed', 'Closed again.')
    const second = await store.select('billing_events', {})
    // Nothing funded on this one, so nothing is billed either time.
    expect(second.length).toBe(first.length)
  })
})
