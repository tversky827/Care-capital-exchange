import { attachInvestor, createActor, installTestStore } from './helpers/harness'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Deal } from '@/types'
import type { Offering } from '@/types/equity'

import { createDeal } from '@/services/deals'
import {
  checkOfferingQuality, createOffering, publishOffering, submitForReview,
} from '@/services/equity/offerings'
import {
  acceptCommitment, acknowledgeDisclosures, evaluateEligibility, recordInterest, submitCommitment,
} from '@/services/equity/commitments'
import {
  advanceOnboarding, createInvestorProfile, requestVerification, updatePreferences,
} from '@/services/equity/investors'
import { setVerificationStatus } from '@/services/equity/investors'
import { analyzeOffering, runBearCase, projectInvestment } from '@/services/equity/analysis'
import { capitalMarketsView, createStack, suggestStack } from '@/services/equity/capital-stack'
import { matchesForInvestor, matchCountsForOffering } from '@/services/equity/matching'
import { portfolioFor } from '@/services/equity/portfolio'
import { dataRoomFor } from '@/services/equity/data-room'

/**
 * The Phase 2 acceptance test.
 *
 * Walks the whole equity workflow the specification requires: a borrower with
 * an existing deal opens its capital stack, raises an offering, an
 * administrator publishes it, an investor onboards, is matched, is checked for
 * eligibility, commits, and appears in a portfolio and in the sponsor's raise.
 *
 * Nothing is mocked. Every step calls the same service the interface calls.
 */

let store: Store
let borrower: Actor
let admin: Actor
let investor: Actor
let deal: Deal
let offering: Offering

const OPERATING_STATEMENT = [
  'Chicago Senior Care — Statement of Operations',
  'Line Item,2024,2025',
  'Total Revenue,"$18,400,000","$19,600,000"',
  'Total Salaries & Benefits,"$10,100,000","$10,600,000"',
  'Agency Labor,"$610,000","$430,000"',
  'Management Fee,"$920,000","$980,000"',
  'Total Operating Expenses,"$15,900,000","$16,700,000"',
  'EBITDA,"$2,500,000","$2,900,000"',
  'Occupancy,88.4%,90.1%',
].join('\n')

beforeAll(async () => {
  store = await installTestStore()

  borrower = await createActor(store, {
    email: 'sponsor@chicagosenior.test', name: 'Alicia Moreno',
    companyName: 'Chicago Senior Care Partners', companyType: 'borrower', role: 'borrower',
  })
  admin = await createActor(store, {
    email: 'admin@ccx.test', name: 'Platform Admin',
    companyName: 'CareCapital Exchange', companyType: 'admin', role: 'admin',
  })
  investor = await createActor(store, {
    email: 'investor@demo.test', name: 'Michael Demo',
    companyName: 'Michael Demo Investments', companyType: 'investor', role: 'investor',
  })

  // Steps 1–2: an existing borrower opens an existing healthcare acquisition.
  deal = await createDeal({
    actor: borrower,
    name: 'Chicago Senior Care Portfolio',
    assetType: 'snf',
    transactionType: 'acquisition',
    borrowerPriority: 'lowest_rate',
    narrative: 'Acquisition of a stabilised 148-bed skilled nursing portfolio in Illinois.',
    facility: {
      name: 'Chicago Senior Care Portfolio', city: 'Chicago', state: 'IL',
      licensed_beds: 148, certified_beds: 148, operating_beds: 148, current_census: 133,
      occupancy_pct: 90.1, year_built: 1996, real_estate_included: true,
    },
    terms: {
      purchase_price: 25_000_000, requested_financing: 17_500_000,
      appraised_value: 25_400_000, estimated_closing_costs: 700_000,
      requested_rate_pct: 7.25, requested_term_months: 60, requested_amortization_months: 300,
    },
    sponsor: {
      legal_entity: 'Chicago Senior Care Partners LLC', years_in_healthcare: 19,
      years_operating_asset_type: 15, facilities_operated: 11, beds_operated: 1_400,
      states_operated: ['IL', 'IN'], historical_acquisitions: 8, previous_exits: 2,
      prior_defaults: false, net_worth: 34_000_000, liquidity: 9_000_000,
    },
  })

  const { uploadDocument } = await import('@/services/documents')
  await uploadDocument({
    actor: borrower,
    dealId: deal.id,
    docType: 'profit_and_loss',
    filename: 'chicago-pl.csv',
    mimeType: 'text/csv',
    data: Buffer.from(OPERATING_STATEMENT),
    processing: 'inline',
  })
})

describe('the borrower raises equity on an existing deal', () => {
  it('shows the capital requirement the deal implies', async () => {
    // Steps 3–5: the capital stack states debt required and derives equity.
    const view = await capitalMarketsView(borrower, deal.id)
    expect(view.requirement.debtRequired).toBe(17_500_000)
    expect(view.requirement.equityRequired).not.toBeNull()
    expect(view.requirement.equityRequired!).toBeGreaterThan(0)
    // Equity is total cost less the debt, not a number anyone typed in.
    expect(view.requirement.totalCost).toBeGreaterThan(view.requirement.debtRequired!)
  })

  it('drafts a capital stack from the deal’s own underwriting', async () => {
    const sources = await suggestStack(deal.id)
    expect(sources.length).toBeGreaterThanOrEqual(2)
    const stack = await createStack(borrower, deal.id, 'Base structure', sources, { activate: true })
    expect(stack.sources.some((s) => s.position === 'senior_debt')).toBe(true)
    expect(stack.sources.some((s) => s.position === 'common_equity')).toBe(true)
    // Shares are derived and sum to the whole.
    const shares = stack.sources.reduce((sum, s) => sum + (s.share_pct ?? 0), 0)
    expect(shares).toBeCloseTo(1, 2)
  })

  it('creates an equity offering with stated terms', async () => {
    // Steps 6–8.
    offering = await createOffering(borrower, deal.id, {
      name: 'Chicago Senior Care Portfolio Equity',
      offering_type: 'reg_d_506b',
      issuer_entity: 'Chicago Senior Care Holdings LLC',
      legal_structure: 'Delaware LLC, manager-managed',
      target_raise: 7_500_000,
      minimum_investment: 50_000,
      terms: {
        capital_position: 'common_equity',
        target_hold_months: 60,
        preferred_return_pct: 0.08,
        target_irr_pct: 16,
        sponsor_promote_pct: 0.2,
        assumptions: {
          hold_years: 5, exit_cap_rate_pct: 9.25, exit_multiple_of_ebitda: null,
          revenue_growth_pct: 3, expense_growth_pct: 3, occupancy_stabilized_pct: 90,
          capex_per_bed: 450, selling_costs_pct: 2, notes: null,
        },
      },
    })
    expect(offering.status).toBe('draft')
    expect(offering.committed_amount).toBe(0)
    // Standard disclosures are seeded so no offering can ship without them.
    const disclosures = await store.select('offering_disclosures', { where: { offering_id: offering.id } })
    expect(disclosures.length).toBeGreaterThanOrEqual(6)
  })

  it('checks the offering for completeness before it can be reviewed', async () => {
    // Step 9.
    const check = await checkOfferingQuality(offering.id)
    expect(['pass', 'warnings']).toContain(check.verdict)
    // Every finding names something specific rather than gesturing at quality.
    for (const finding of check.findings) {
      expect(finding.detail.length).toBeGreaterThan(20)
      expect(finding.code).toBeTruthy()
    }
  })

  it('refuses to publish an offering with blocking problems', async () => {
    const broken = await createOffering(borrower, deal.id, {
      name: 'Incomplete Offering',
      offering_type: 'reg_d_506b',
      // No issuer, no raise, no assumptions: three blockers.
    })
    const check = await checkOfferingQuality(broken.id)
    expect(check.verdict).toBe('blockers')
    await expect(publishOffering(admin, broken.id)).rejects.toThrow(/blocking/i)
  })

  it('routes the offering through review and publication', async () => {
    // Steps 10–11. A sponsor submits; only an administrator publishes.
    const submitted = await submitForReview(borrower, offering.id)
    expect(submitted.status).toBe('compliance_review')
    await expect(publishOffering(borrower, offering.id)).rejects.toThrow(/administrator/i)

    const published = await publishOffering(admin, offering.id)
    expect(published.status).toBe('live')
    expect(published.published_by).toBe(admin.user.id)
    offering = published
  })
})

describe('an investor onboards and is matched', () => {
  it('completes onboarding through every stage', async () => {
    // Steps 12–14.
    await createInvestorProfile(investor, {
      display_name: 'Michael Demo', investor_type: 'individual', state: 'IL',
    })
    investor = await attachInvestor(store, investor)

    await updatePreferences(investor, {
      typical_investment: 150_000,
      asset_types: ['snf'],
      states: ['IL'],
      capital_positions: ['common_equity'],
      target_return_min_pct: 13,
      min_hold_months: 36,
      max_hold_months: 84,
      risk_tolerance: 'moderate',
    })

    for (const stage of ['experience', 'preferences', 'risk', 'eligibility'] as const) {
      investor = await attachInvestor(store, investor)
      await advanceOnboarding(investor, stage)
    }
    investor = await attachInvestor(store, investor)
    expect(investor.investor?.onboarding_stage).toBe('kyc')
  })

  it('records verification verdicts from the provider, never inventing them', async () => {
    for (const kind of ['identity', 'kyc', 'aml'] as const) {
      const record = await requestVerification(investor, kind)
      expect(record.status).toBe('verified')
      expect(record.provider).toBe('demo-verification')
    }
    // Accreditation stays pending until a human resolves it.
    const accreditation = await requestVerification(investor, 'accreditation')
    expect(accreditation.status).toBe('pending')

    for (const stage of ['kyc', 'accreditation', 'agreements', 'account'] as const) {
      investor = await attachInvestor(store, investor)
      await advanceOnboarding(investor, stage)
    }
    investor = await attachInvestor(store, investor)
    expect(investor.investor?.onboarding_stage).toBe('complete')
  })

  it('surfaces the offering as consistent with stated preferences', async () => {
    // Steps 15–16.
    const matches = await matchesForInvestor(investor.investor!.id, { includeIneligible: true })
    const match = matches.find((m) => m.offering.id === offering.id)
    expect(match).toBeDefined()
    expect(match!.match.score).toBeGreaterThan(70)
    expect(match!.match.reasons.join(' ')).toMatch(/skilled nursing|IL|common equity/i)
    // A match is never phrased as a recommendation.
    expect(match!.match.reasons.join(' ')).not.toMatch(/should invest|recommend/i)
  })

  it('tells the sponsor how many investors matched, not who', async () => {
    const counts = await matchCountsForOffering(offering.id)
    expect(counts.total).toBeGreaterThanOrEqual(1)
    expect(Object.keys(counts)).toEqual(['total', 'strong', 'possible'])
  })
})

describe('the investor reviews and commits', () => {
  it('produces an analysis with projections computed, not generated', async () => {
    // Steps 17–20.
    const analysis = await analyzeOffering(offering.id)
    expect(analysis).not.toBeNull()
    expect(analysis!.projection.insufficientData).toBeNull()
    expect(analysis!.projection.years).toHaveLength(5)
    expect(analysis!.projection.irrPct).not.toBeNull()
    // The narrative never promises a return.
    expect(analysis!.analysis.thesis).not.toMatch(/guaranteed|will return|safe investment/i)
    expect(analysis!.analysis.thesis).toMatch(/projection|not a recommendation|assumption/i)
    expect(analysis!.risk.categories.length).toBeGreaterThan(4)
  })

  it('runs a downside scenario deterministically', async () => {
    // Step 24.
    const bear = await runBearCase(offering.id)
    expect(bear).not.toBeNull()
    expect(bear!.results.insufficient_data).toBeNull()
    const base = await analyzeOffering(offering.id)
    // The downside must actually be worse than the base case.
    expect(bear!.results.irr_pct!).toBeLessThan(base!.projection.irrPct!)
    expect(bear!.narrative.drivers.length).toBeGreaterThan(3)
  })

  it('scales a projection to a specific investment amount', async () => {
    const result = await projectInvestment(offering.id, 150_000)
    expect(result!.insufficientData).toBeNull()
    expect(result!.ownershipPct).toBeCloseTo(150_000 / 7_500_000, 6)
    // A ratio does not change with the size of the stake.
    const larger = await projectInvestment(offering.id, 600_000)
    expect(larger!.projectedIrrPct).toBe(result!.projectedIrrPct)
    expect(larger!.projectedTotal!).toBeGreaterThan(result!.projectedTotal!)
  })

  it('releases documents only at the access level the investor has reached', async () => {
    // Step 21.
    const before = await dataRoomFor(investor, offering.id)
    const levels = before.map((entry) => entry.entry.access_level)
    expect(levels).not.toContain('committed_investor')
  })

  it('refuses a commitment while accreditation is pending', async () => {
    // Steps 25–26: the eligibility gate does its job.
    await recordInterest(investor, offering.id, { indicatedAmount: 150_000 })
    const eligibility = await evaluateEligibility(investor, offering.id)
    expect(eligibility.verdict).not.toBe('eligible')
    expect(eligibility.requirements.find((r) => r.key === 'accreditation')?.satisfied).toBe(false)
    await expect(submitCommitment(investor, offering.id, 150_000)).rejects.toThrow()
  })

  it('accepts a commitment once every requirement is met', async () => {
    // Step 27.
    await setVerificationStatus(admin, investor.investor!.id, 'accreditation', 'verified', 'Reviewed by compliance.')
    const disclosures = await store.select('offering_disclosures', { where: { offering_id: offering.id } })
    await acknowledgeDisclosures(investor, offering.id, disclosures.map((d) => d.id))

    const eligibility = await evaluateEligibility(investor, offering.id)
    expect(eligibility.verdict).toBe('eligible')

    const commitment = await submitCommitment(investor, offering.id, 150_000)
    expect(commitment.status).toBe('submitted')
    expect(commitment.acknowledged_disclosures.length).toBeGreaterThanOrEqual(6)
  })

  it('rejects an amount below the offering minimum', async () => {
    await expect(submitCommitment(investor, offering.id, 1_000)).rejects.toThrow(/minimum/i)
  })

  it('opens a position when the sponsor accepts', async () => {
    // Steps 28–29.
    const commitment = await store.selectOne('investment_commitments', {
      where: { offering_id: offering.id, investor_id: investor.investor!.id, status: 'submitted' },
    })
    const position = await acceptCommitment(borrower, commitment!.id)
    expect(position.invested_amount).toBe(150_000)
    expect(position.ownership_pct).toBeCloseTo(0.02, 4)

    const updated = await store.findById('offerings', offering.id)
    // The raise total is maintained from accepted commitments.
    expect(updated!.committed_amount).toBe(150_000)
  })

  it('shows the position in the investor’s portfolio', async () => {
    const portfolio = await portfolioFor(investor)
    expect(portfolio.capitalInvested).toBe(150_000)
    expect(portfolio.activeCount).toBe(1)
    expect(portfolio.positions[0]?.offering.id).toBe(offering.id)
  })

  it('shows the raise progressing on the sponsor’s capital stack', async () => {
    // Step 30.
    const view = await capitalMarketsView(borrower, deal.id)
    expect(view.equity.committed).toBe(150_000)
    expect(view.equity.offerings).toBeGreaterThanOrEqual(1)
    expect(view.equity.interested).toBeGreaterThanOrEqual(1)
  })

  it('records every consequential action in the audit log', async () => {
    // Step 32.
    const logs = await store.select('audit_logs', { where: { deal_id: deal.id } })
    const actions = logs.map((log) => log.action)
    for (const action of [
      'offering.created', 'offering.submitted_for_review', 'offering.published',
      'investment.interest_expressed', 'investment.disclosures_acknowledged',
      'investment.commitment_submitted', 'investment.commitment_accepted',
    ]) {
      expect(actions).toContain(action)
    }
  })
})
