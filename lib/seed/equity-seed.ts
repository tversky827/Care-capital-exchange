import type { Store } from '@/db'
import { defaultTiers } from '@/lib/equity/waterfall'
import { ownershipShare } from '@/lib/equity/returns'
import { round } from '@/lib/finance/calculations'
import type { Company, CompanyMember, Deal, User } from '@/types'
import type {
  DistributionEvent, InvestmentCommitment, InvestmentDistribution, InvestmentInterest,
  InvestmentPosition, InvestorPreferences, InvestorProfile, InvestorUpdate, InvestorVerification,
  Offering, OfferingDisclosure, OfferingDocument, OfferingEligibility, OfferingTerms,
  TaxDocument, WaterfallStructure, WaterfallTier,
} from '@/types/equity'

/**
 * Demonstration data for the equity marketplace.
 *
 * Every investor, offering, commitment and distribution below is invented. The
 * figures are chosen to be plausible for skilled nursing — mid-teens target
 * returns, an 8% preferred, five-year holds — and to include the cases that
 * make the product worth having: an offering still in review, one that is
 * fully subscribed, an investor whose accreditation is pending, and a raise
 * that has barely moved.
 *
 * No real person's identity or financial information appears here.
 */

const DEMO_PASSWORD_NOTE = 'DEMO DATA — NOT REAL INVESTMENTS'

interface InvestorFixture {
  slug: string
  company: string
  displayName: string
  email: string
  name: string
  title: string
  investorType: InvestorProfile['investor_type']
  state: string
  city: string
  yearsInvesting: number
  healthcare: boolean
  typicalInvestment: number
  assetTypes: string[]
  states: string[]
  positions: string[]
  riskTolerance: InvestorPreferences['risk_tolerance']
  targetReturnMin: number
  minHoldMonths: number
  maxHoldMonths: number
  maxLeveragePct: number
  /** Accreditation left pending shows the eligibility gate doing its job. */
  accreditationPending?: boolean
}

const INVESTORS: InvestorFixture[] = [
  {
    slug: 'michael-demo', company: 'Michael Demo Investments', displayName: 'Michael Demo',
    email: 'michael@demoinvestor.demo', name: 'Michael Demo', title: 'Principal',
    investorType: 'individual', state: 'IL', city: 'Chicago',
    yearsInvesting: 12, healthcare: true, typicalInvestment: 150_000,
    assetTypes: ['snf', 'alf', 'behavioral_health'], states: ['IL', 'IN', 'TX', 'FL'],
    positions: ['common_equity', 'preferred_equity'], riskTolerance: 'moderate',
    targetReturnMin: 13, minHoldMonths: 36, maxHoldMonths: 84, maxLeveragePct: 0.75,
  },
  {
    slug: 'harborline', company: 'Harborline Family Office', displayName: 'Harborline Family Office',
    email: 'invest@harborline.demo', name: 'Priya Raghavan', title: 'Director of Investments',
    investorType: 'family_office', state: 'NY', city: 'New York',
    yearsInvesting: 22, healthcare: true, typicalInvestment: 500_000,
    assetTypes: ['snf', 'medical_office'], states: ['NY', 'IL', 'MN', 'MO'],
    positions: ['preferred_equity'], riskTolerance: 'conservative',
    targetReturnMin: 11, minHoldMonths: 48, maxHoldMonths: 120, maxLeveragePct: 0.68,
  },
  {
    slug: 'cedarpoint', company: 'Cedar Point Capital LLC', displayName: 'Cedar Point Capital',
    email: 'deals@cedarpointcap.demo', name: 'Daniel Okafor', title: 'Managing Member',
    investorType: 'llc', state: 'TX', city: 'Austin',
    yearsInvesting: 8, healthcare: false, typicalInvestment: 250_000,
    assetTypes: ['snf', 'behavioral_health', 'hospital'], states: [],
    positions: ['common_equity'], riskTolerance: 'opportunistic',
    targetReturnMin: 18, minHoldMonths: 24, maxHoldMonths: 60, maxLeveragePct: 0.85,
  },
  {
    slug: 'wrenfield', company: 'Wrenfield Trust', displayName: 'Wrenfield Trust',
    email: 'trustee@wrenfield.demo', name: 'Eleanor Whitcombe', title: 'Trustee',
    investorType: 'trust', state: 'MA', city: 'Boston',
    yearsInvesting: 30, healthcare: false, typicalInvestment: 300_000,
    assetTypes: ['snf', 'alf'], states: ['MA', 'IL', 'MN'],
    positions: ['preferred_equity'], riskTolerance: 'conservative',
    targetReturnMin: 9, minHoldMonths: 60, maxHoldMonths: 120, maxLeveragePct: 0.65,
  },
  {
    slug: 'northstar', company: 'Northstar Healthcare Partners', displayName: 'Northstar Healthcare Partners',
    email: 'ic@northstarhcp.demo', name: 'Grace Lindqvist', title: 'Partner',
    investorType: 'institution', state: 'MN', city: 'Minneapolis',
    yearsInvesting: 15, healthcare: true, typicalInvestment: 750_000,
    assetTypes: ['snf'], states: ['MN', 'IA', 'WI', 'MO'],
    positions: ['common_equity', 'preferred_equity'], riskTolerance: 'moderate',
    targetReturnMin: 14, minHoldMonths: 36, maxHoldMonths: 72, maxLeveragePct: 0.72,
  },
  {
    slug: 'bellweather', company: 'Bellweather Holdings', displayName: 'Bellweather Holdings',
    email: 'invest@bellweather.demo', name: 'Tomás Cabrera', title: 'Chief Investment Officer',
    investorType: 'llc', state: 'FL', city: 'Miami',
    yearsInvesting: 6, healthcare: false, typicalInvestment: 100_000,
    assetTypes: ['alf', 'memory_care'], states: ['FL', 'GA'],
    positions: ['common_equity'], riskTolerance: 'opportunistic',
    targetReturnMin: 20, minHoldMonths: 24, maxHoldMonths: 48, maxLeveragePct: 0.8,
  },
  {
    slug: 'quarrystone', company: 'Quarrystone Advisors', displayName: 'Quarrystone Advisors',
    email: 'private@quarrystone.demo', name: 'Ada Nwachukwu', title: 'Head of Alternatives',
    investorType: 'institution', state: 'IL', city: 'Chicago',
    yearsInvesting: 18, healthcare: true, typicalInvestment: 400_000,
    assetTypes: ['snf', 'medical_office', 'hospice'], states: ['IL', 'MO', 'IN'],
    positions: ['preferred_equity', 'mezzanine'], riskTolerance: 'moderate',
    targetReturnMin: 12, minHoldMonths: 48, maxHoldMonths: 96, maxLeveragePct: 0.7,
  },
  {
    slug: 'linden', company: 'Linden Row Capital', displayName: 'Linden Row Capital',
    email: 'team@lindenrow.demo', name: 'Jonah Feld', title: 'Founder',
    investorType: 'llc', state: 'IL', city: 'Evanston',
    yearsInvesting: 4, healthcare: false, typicalInvestment: 75_000,
    assetTypes: ['snf'], states: ['IL'],
    positions: ['common_equity'], riskTolerance: 'moderate',
    targetReturnMin: 15, minHoldMonths: 36, maxHoldMonths: 60, maxLeveragePct: 0.78,
    // Left pending so the demo shows an offering refusing a commitment.
    accreditationPending: true,
  },
  {
    slug: 'marlowe', company: 'Marlowe Private Wealth', displayName: 'Marlowe Private Wealth',
    email: 'alts@marlowepw.demo', name: 'Simone Aubert', title: 'Portfolio Manager',
    investorType: 'family_office', state: 'CA', city: 'San Francisco',
    yearsInvesting: 20, healthcare: false, typicalInvestment: 350_000,
    assetTypes: ['medical_office', 'snf'], states: ['CA', 'TX', 'IL'],
    positions: ['preferred_equity'], riskTolerance: 'conservative',
    targetReturnMin: 10, minHoldMonths: 60, maxHoldMonths: 120, maxLeveragePct: 0.6,
  },
  {
    slug: 'ashcroft', company: 'Ashcroft Individual Account', displayName: 'Ruth Ashcroft',
    email: 'ruth@ashcroftinvest.demo', name: 'Ruth Ashcroft', title: 'Private investor',
    investorType: 'individual', state: 'WI', city: 'Madison',
    yearsInvesting: 9, healthcare: true, typicalInvestment: 60_000,
    assetTypes: ['snf', 'home_health'], states: ['WI', 'MN', 'IL'],
    positions: ['common_equity'], riskTolerance: 'moderate',
    targetReturnMin: 14, minHoldMonths: 36, maxHoldMonths: 72, maxLeveragePct: 0.75,
  },
]

interface OfferingFixture {
  dealReference: string
  name: string
  offeringType: Offering['offering_type']
  capitalPosition: OfferingTerms['capital_position']
  issuer: string
  structure: string
  summary: string
  targetRaise: number
  minimum: number
  maximum: number | null
  holdYears: number
  preferredReturnPct: number
  targetIrrPct: number
  targetMultiple: number
  promotePct: number
  exitCapRatePct: number | null
  exitMultiple: number | null
  revenueGrowthPct: number
  expenseGrowthPct: number
  sellingCostsPct: number
  status: Offering['status']
  /** Investor slug to committed amount. */
  commitments: { investor: string; amount: number; accepted: boolean }[]
  interests: string[]
  distributions?: { period: string; amount: number }[]
}

const OFFERINGS: OfferingFixture[] = [
  {
    dealReference: 'CCX-1001',
    name: 'Lakeview Skilled Nursing Equity',
    offeringType: 'reg_d_506b',
    capitalPosition: 'common_equity',
    issuer: 'Meridian Lakeview Holdings LLC',
    structure: 'Delaware LLC, manager-managed',
    summary: 'Common equity alongside the sponsor in the acquisition of a stabilised 120-bed skilled nursing facility in Rockford, Illinois.',
    targetRaise: 3_500_000, minimum: 50_000, maximum: 1_000_000,
    holdYears: 5, preferredReturnPct: 0.08, targetIrrPct: 15.5, targetMultiple: 1.85,
    promotePct: 0.2, exitCapRatePct: 9.25, exitMultiple: null,
    revenueGrowthPct: 3, expenseGrowthPct: 3.2, sellingCostsPct: 2,
    status: 'live',
    commitments: [
      { investor: 'michael-demo', amount: 150_000, accepted: true },
      { investor: 'northstar', amount: 750_000, accepted: true },
      { investor: 'quarrystone', amount: 400_000, accepted: true },
      { investor: 'cedarpoint', amount: 250_000, accepted: false },
    ],
    interests: ['harborline', 'ashcroft', 'linden'],
    distributions: [
      { period: 'Q1 2027', amount: 70_000 },
      { period: 'Q2 2027', amount: 74_500 },
    ],
  },
  {
    dealReference: 'CCX-1007',
    name: 'Northgate Transitional Care Preferred',
    offeringType: 'reg_d_506c',
    capitalPosition: 'preferred_equity',
    issuer: 'Meridian Northgate Preferred LLC',
    structure: 'Delaware LLC, preferred units',
    summary: 'Preferred equity with an 8% cumulative return in the refinancing of a 124-bed facility in Rochester, Minnesota.',
    targetRaise: 2_200_000, minimum: 100_000, maximum: null,
    holdYears: 4, preferredReturnPct: 0.08, targetIrrPct: 11.5, targetMultiple: 1.42,
    promotePct: 0.15, exitCapRatePct: 9.5, exitMultiple: null,
    revenueGrowthPct: 2.5, expenseGrowthPct: 2.8, sellingCostsPct: 2,
    status: 'live',
    commitments: [
      { investor: 'harborline', amount: 500_000, accepted: true },
      { investor: 'wrenfield', amount: 300_000, accepted: true },
      { investor: 'marlowe', amount: 350_000, accepted: false },
    ],
    interests: ['quarrystone', 'michael-demo'],
    distributions: [{ period: 'Q2 2027', amount: 44_000 }],
  },
  {
    dealReference: 'CCX-1003',
    name: 'Cedar Ridge Care Center Equity',
    offeringType: 'reg_d_506b',
    capitalPosition: 'common_equity',
    issuer: 'Auburn Cedar Ridge Holdings LLC',
    structure: 'Indiana LLC, manager-managed',
    summary: 'Common equity in the refinancing and repositioning of a 96-bed skilled nursing facility in Fort Wayne, Indiana.',
    targetRaise: 1_800_000, minimum: 50_000, maximum: 500_000,
    holdYears: 5, preferredReturnPct: 0.07, targetIrrPct: 16.5, targetMultiple: 1.95,
    promotePct: 0.2, exitCapRatePct: null, exitMultiple: 6.25,
    revenueGrowthPct: 3.5, expenseGrowthPct: 3.5, sellingCostsPct: 2.5,
    status: 'live',
    commitments: [
      { investor: 'cedarpoint', amount: 250_000, accepted: true },
      { investor: 'michael-demo', amount: 100_000, accepted: true },
    ],
    interests: ['bellweather', 'ashcroft'],
  },
  {
    dealReference: 'CCX-1002',
    name: 'Prairie Meadows Recapitalisation',
    offeringType: 'reg_d_506b',
    capitalPosition: 'preferred_equity',
    issuer: 'Auburn Prairie Meadows Preferred LLC',
    structure: 'Delaware LLC, preferred units',
    summary: 'Preferred equity in the recapitalisation of a 110-bed facility, funding a capital improvement programme.',
    targetRaise: 1_500_000, minimum: 100_000, maximum: null,
    holdYears: 4, preferredReturnPct: 0.09, targetIrrPct: 12.5, targetMultiple: 1.48,
    promotePct: 0.15, exitCapRatePct: 9.75, exitMultiple: null,
    revenueGrowthPct: 2.5, expenseGrowthPct: 3, sellingCostsPct: 2,
    status: 'live',
    commitments: [{ investor: 'wrenfield', amount: 300_000, accepted: true }],
    interests: ['harborline', 'marlowe', 'northstar'],
  },
  {
    dealReference: 'CCX-1005',
    name: 'Summit Ridge Behavioral Equity',
    offeringType: 'reg_d_506c',
    capitalPosition: 'common_equity',
    issuer: 'Copperline Summit Ridge LLC',
    structure: 'Delaware LLC, manager-managed',
    summary: 'Common equity in the acquisition of a behavioral health campus with an established referral base.',
    targetRaise: 2_750_000, minimum: 75_000, maximum: null,
    holdYears: 6, preferredReturnPct: 0.08, targetIrrPct: 18, targetMultiple: 2.1,
    promotePct: 0.25, exitCapRatePct: null, exitMultiple: 7,
    revenueGrowthPct: 4.5, expenseGrowthPct: 4, sellingCostsPct: 2.5,
    status: 'live',
    commitments: [{ investor: 'cedarpoint', amount: 300_000, accepted: true }],
    interests: ['bellweather', 'michael-demo', 'quarrystone'],
  },
  {
    dealReference: 'CCX-1004',
    name: 'Grandview Manor Equity',
    offeringType: 'reg_d_506b',
    capitalPosition: 'common_equity',
    issuer: 'Copperline Grandview Holdings LLC',
    structure: 'Delaware LLC, manager-managed',
    summary: 'Common equity in the acquisition of a 138-bed facility with a repositioning plan for the memory care wing.',
    targetRaise: 4_200_000, minimum: 100_000, maximum: null,
    holdYears: 5, preferredReturnPct: 0.08, targetIrrPct: 17, targetMultiple: 2,
    promotePct: 0.2, exitCapRatePct: 9, exitMultiple: null,
    revenueGrowthPct: 3, expenseGrowthPct: 3, sellingCostsPct: 2,
    // Awaiting review: shows an administrator the publication decision.
    status: 'compliance_review',
    commitments: [],
    interests: [],
  },
  {
    dealReference: 'CCX-1006',
    name: 'Riverbend Health Campus Equity',
    offeringType: 'reg_d_506b',
    capitalPosition: 'common_equity',
    issuer: 'Auburn Riverbend Holdings LLC',
    structure: 'Delaware LLC, manager-managed',
    summary: 'Common equity in a bridge acquisition of a health campus, with a refinancing planned in month eighteen.',
    targetRaise: 900_000, minimum: 50_000, maximum: 250_000,
    holdYears: 3, preferredReturnPct: 0.08, targetIrrPct: 19, targetMultiple: 1.7,
    promotePct: 0.2, exitCapRatePct: null, exitMultiple: 6,
    revenueGrowthPct: 3, expenseGrowthPct: 3.5, sellingCostsPct: 2,
    // Fully subscribed: shows the closed state and its effect on eligibility.
    status: 'fully_subscribed',
    commitments: [
      { investor: 'northstar', amount: 500_000, accepted: true },
      { investor: 'ashcroft', amount: 60_000, accepted: true },
      { investor: 'michael-demo', amount: 340_000, accepted: true },
    ],
    interests: ['linden'],
  },
  {
    dealReference: 'CCX-1008',
    name: 'Whitfield Commons Equity',
    offeringType: 'reg_d_506b',
    capitalPosition: 'common_equity',
    issuer: 'Meridian Whitfield Commons LLC',
    structure: 'Delaware LLC, manager-managed',
    summary: 'Common equity in the acquisition of a 92-bed facility with a stabilising census.',
    targetRaise: 2_000_000, minimum: 50_000, maximum: null,
    holdYears: 5, preferredReturnPct: 0.08, targetIrrPct: 14, targetMultiple: 1.8,
    promotePct: 0.2, exitCapRatePct: 9.5, exitMultiple: null,
    revenueGrowthPct: 3, expenseGrowthPct: 3, sellingCostsPct: 2,
    // Barely started: a raise with real distance to run.
    status: 'live',
    commitments: [{ investor: 'ashcroft', amount: 60_000, accepted: true }],
    interests: ['michael-demo'],
  },
]

export async function seedEquityDemo(store: Store, hashPassword: (value: string) => Promise<string>): Promise<void> {
  const passwordHash = await hashPassword('DemoPass123!')
  const now = new Date().toISOString()
  const profiles = new Map<string, InvestorProfile>()

  // --- investors -----------------------------------------------------------
  for (const fixture of INVESTORS) {
    const company = await store.insert('companies', {
      name: fixture.company, type: 'investor', website: null, description: null,
      address_line1: null, city: fixture.city, state: fixture.state, zip: null, status: 'active',
    } as Omit<Company, 'id' | 'created_at' | 'updated_at'>)

    const user = await store.insert('users', {
      email: fixture.email, full_name: fixture.name, phone: null, role: 'investor',
      password_hash: passwordHash, mfa_enabled: false, mfa_required: false, status: 'active',
      title: fixture.title, last_login_at: now,
      notification_preferences: { in_app: true, email: true, sms: false, muted_events: [] },
    } as Omit<User, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('company_members', {
      company_id: company.id, user_id: user.id, role: 'owner',
    } as Omit<CompanyMember, 'id' | 'created_at'>)

    const profile = await store.insert('investor_profiles', {
      company_id: company.id,
      display_name: fixture.displayName,
      investor_type: fixture.investorType,
      state: fixture.state,
      country: 'US',
      years_investing: fixture.yearsInvesting,
      healthcare_experience: fixture.healthcare,
      prior_private_placements: Math.max(1, Math.round(fixture.yearsInvesting / 3)),
      self_certified_accredited: true,
      accreditation_basis: fixture.investorType === 'individual' ? 'net_worth' : 'entity_assets',
      onboarding_stage: 'complete',
      onboarding_completed_at: now,
      status: 'active',
    } as Omit<InvestorProfile, 'id' | 'created_at' | 'updated_at'>)
    profiles.set(fixture.slug, profile)

    await store.insert('investor_preferences', {
      investor_id: profile.id,
      investment_range: null,
      typical_investment: fixture.typicalInvestment,
      asset_types: fixture.assetTypes as never,
      states: fixture.states,
      min_hold_months: fixture.minHoldMonths,
      max_hold_months: fixture.maxHoldMonths,
      max_leverage_pct: fixture.maxLeveragePct,
      risk_tolerance: fixture.riskTolerance,
      target_return_min_pct: fixture.targetReturnMin,
      target_return_max_pct: null,
      return_preference: fixture.riskTolerance === 'conservative' ? 'income' : 'balanced',
      capital_positions: fixture.positions as never,
    } as Omit<InvestorPreferences, 'id' | 'created_at' | 'updated_at'>)

    for (const kind of ['identity', 'kyc', 'aml', 'accreditation'] as const) {
      const pending = kind === 'accreditation' && fixture.accreditationPending
      await store.insert('investor_verifications', {
        investor_id: profile.id,
        kind,
        status: pending ? 'pending' : 'verified',
        provider: 'demo-verification',
        provider_reference: `demo-${kind}`,
        detail: pending ? 'Accreditation review outstanding in this demonstration environment.' : DEMO_PASSWORD_NOTE,
        verified_at: pending ? null : now,
        expires_at: null,
      } as Omit<InvestorVerification, 'id' | 'created_at' | 'updated_at'>)
    }
  }

  // --- offerings ------------------------------------------------------------
  const deals = await store.select('deals')
  const dealByReference = new Map<string, Deal>(deals.map((deal) => [deal.reference, deal]))
  let reference = 1001

  for (const fixture of OFFERINGS) {
    const deal = dealByReference.get(fixture.dealReference)
    if (!deal) continue

    const creator = await store.selectOne('company_members', { where: { company_id: deal.company_id } })
    if (!creator) continue

    const accepted = fixture.commitments.filter((c) => c.accepted)
    const committed = round(accepted.reduce((sum, c) => sum + c.amount, 0), 2)
    const isPublished = ['live', 'fully_subscribed', 'paused', 'closed'].includes(fixture.status)

    const offering = await store.insert('offerings', {
      deal_id: deal.id,
      company_id: deal.company_id,
      name: fixture.name,
      reference: `OFF-${reference++}`,
      offering_type: fixture.offeringType,
      legal_structure: fixture.structure,
      issuer_entity: fixture.issuer,
      summary: fixture.summary,
      target_raise: fixture.targetRaise,
      minimum_investment: fixture.minimum,
      maximum_investment: fixture.maximum,
      committed_amount: committed,
      offering_start_date: isPublished ? now : null,
      offering_end_date: null,
      target_close_date: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      status: fixture.status,
      disclosure_status: isPublished ? 'published' : 'drafted',
      compliance_status: isPublished ? 'cleared' : 'in_review',
      published_at: isPublished ? now : null,
      published_by: isPublished ? creator.user_id : null,
      closed_at: null,
      created_by: creator.user_id,
    } as Omit<Offering, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('offering_terms', {
      offering_id: offering.id,
      capital_position: fixture.capitalPosition,
      target_hold_months: fixture.holdYears * 12,
      preferred_return_pct: fixture.preferredReturnPct,
      target_irr_pct: fixture.targetIrrPct,
      target_equity_multiple: fixture.targetMultiple,
      target_cash_on_cash_pct: round(fixture.preferredReturnPct * 100, 2),
      sponsor_promote_pct: fixture.promotePct,
      distribution_frequency: 'quarterly',
      acquisition_fee_pct: 0.01,
      asset_management_fee_pct: 0.015,
      disposition_fee_pct: 0.01,
      assumptions: {
        hold_years: fixture.holdYears,
        exit_cap_rate_pct: fixture.exitCapRatePct,
        exit_multiple_of_ebitda: fixture.exitMultiple,
        revenue_growth_pct: fixture.revenueGrowthPct,
        expense_growth_pct: fixture.expenseGrowthPct,
        occupancy_stabilized_pct: 89,
        capex_per_bed: 450,
        selling_costs_pct: fixture.sellingCostsPct,
        notes: 'Illustrative assumptions for a demonstration offering.',
      },
    } as Omit<OfferingTerms, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('offering_eligibility', {
      offering_id: offering.id,
      accredited_required: true,
      verification_required: true,
      excluded_states: [],
      permitted_states: [],
      entity_types_permitted: [],
      minimum_net_worth: null,
      minimum_income: null,
      investment_limit: null,
      verification_provider: 'demo-verification',
      transaction_provider: 'demo-transaction',
      broker_dealer: null,
      funding_portal: null,
      custodian: null,
      transfer_agent: null,
      required_acknowledgements: [],
    } as Omit<OfferingEligibility, 'id' | 'created_at' | 'updated_at'>)

    await seedDisclosures(store, offering.id)
    const waterfallId = await seedWaterfall(store, offering.id, fixture.promotePct)
    await publishDealDocuments(store, offering.id, deal.id)

    // --- engagement --------------------------------------------------------
    for (const slug of [...fixture.interests, ...fixture.commitments.map((c) => c.investor)]) {
      const profile = profiles.get(slug)
      if (!profile) continue
      const existing = await store.selectOne('investment_interests', {
        where: { offering_id: offering.id, investor_id: profile.id },
      })
      if (existing) continue
      const commitment = fixture.commitments.find((c) => c.investor === slug)
      await store.insert('investment_interests', {
        offering_id: offering.id,
        investor_id: profile.id,
        deal_id: deal.id,
        stage: commitment ? (commitment.accepted ? 'invested' : 'commitment_submitted') : 'reviewing_documents',
        indicated_amount: commitment?.amount ?? null,
        notes: null,
        first_viewed_at: now,
        expressed_at: now,
        withdrawn_at: null,
      } as Omit<InvestmentInterest, 'id' | 'created_at' | 'updated_at'>)
    }

    const positions = new Map<string, InvestmentPosition>()
    for (const entry of fixture.commitments) {
      const profile = profiles.get(entry.investor)
      if (!profile) continue
      const interest = await store.selectOne('investment_interests', {
        where: { offering_id: offering.id, investor_id: profile.id },
      })
      if (!interest) continue

      const disclosures = await store.select('offering_disclosures', { where: { offering_id: offering.id } })
      for (const disclosure of disclosures) {
        await store.insert('disclosure_acknowledgements', {
          offering_id: offering.id,
          disclosure_id: disclosure.id,
          investor_id: profile.id,
          user_id: profile.company_id,
          disclosure_version: disclosure.version,
          acknowledged_at: now,
          ip_address: null,
          user_agent: null,
        } as never)
      }

      const commitment = await store.insert('investment_commitments', {
        offering_id: offering.id,
        investor_id: profile.id,
        interest_id: interest.id,
        amount: entry.amount,
        status: entry.accepted ? 'accepted' : 'submitted',
        acknowledged_disclosures: disclosures.map((d) => d.id),
        submitted_at: now,
        accepted_at: entry.accepted ? now : null,
        accepted_by: entry.accepted ? creator.user_id : null,
        rejected_reason: null,
      } as Omit<InvestmentCommitment, 'id' | 'created_at' | 'updated_at'>)

      if (entry.accepted) {
        const position = await store.insert('investment_positions', {
          offering_id: offering.id,
          investor_id: profile.id,
          deal_id: deal.id,
          invested_amount: entry.amount,
          ownership_pct: ownershipShare(entry.amount, fixture.targetRaise),
          capital_position: fixture.capitalPosition,
          // The sponsor's estimate: modestly above cost for a seasoned deal.
          estimated_value: round(entry.amount * 1.06, 2),
          estimated_value_at: now,
          distributions_received: 0,
          status: 'active',
          acquired_at: new Date(Date.now() - 300 * 86_400_000).toISOString(),
          exited_at: null,
        } as Omit<InvestmentPosition, 'id' | 'created_at' | 'updated_at'>)
        positions.set(entry.investor, position)
      }
      void commitment
    }

    // --- distributions ------------------------------------------------------
    for (const distribution of fixture.distributions ?? []) {
      const event = await store.insert('distribution_events', {
        offering_id: offering.id,
        deal_id: deal.id,
        kind: 'operating',
        period_label: distribution.period,
        total_amount: distribution.amount,
        status: 'processed',
        scheduled_for: now,
        approved_by: creator.user_id,
        approved_at: now,
        processed_at: now,
        failure_reason: null,
        notes: null,
      } as Omit<DistributionEvent, 'id' | 'created_at' | 'updated_at'>)

      const totalInvested = accepted.reduce((sum, c) => sum + c.amount, 0)
      for (const entry of accepted) {
        const position = positions.get(entry.investor)
        if (!position || totalInvested <= 0) continue
        const share = entry.amount / totalInvested
        const amount = round(distribution.amount * share, 2)
        await store.insert('investment_distributions', {
          distribution_event_id: event.id,
          position_id: position.id,
          investor_id: position.investor_id,
          offering_id: offering.id,
          amount,
          return_of_capital: 0,
          preferred_return: amount,
          profit_share: 0,
          status: 'processed',
          processed_at: now,
        } as Omit<InvestmentDistribution, 'id' | 'created_at' | 'updated_at'>)

        await store.update('investment_positions', position.id, {
          distributions_received: round(position.distributions_received + amount, 2),
        } as Partial<InvestmentPosition>)
        position.distributions_received = round(position.distributions_received + amount, 2)
      }
    }

    // --- reporting -----------------------------------------------------------
    if (fixture.distributions && fixture.distributions.length > 0) {
      await store.insert('investor_updates', {
        offering_id: offering.id,
        deal_id: deal.id,
        period_label: 'Q2 2027',
        title: `${fixture.name}: second quarter update`,
        body: [
          'Census held steady through the quarter and agency reliance continued to fall as permanent hires completed orientation.',
          'Revenue and EBITDA both finished ahead of the prior quarter. The distribution for the period was paid in full at the preferred rate.',
          'Reimbursement remains the principal uncertainty: the state rate setting for the coming year has not yet been published.',
          'This is demonstration content for a fictional investment.',
        ].join('\n\n'),
        generator: 'ai',
        status: 'published',
        metrics: {
          revenue: 3_900_000, ebitda: 425_000, occupancy_pct: 89.2,
          agency_labor_pct: 4.1, debt_balance: 16_900_000, capex: 82_000,
          distribution_per_100k: 2_750,
        },
        approved_by: creator.user_id,
        approved_at: now,
        published_at: now,
        created_by: creator.user_id,
      } as Omit<InvestorUpdate, 'id' | 'created_at' | 'updated_at'>)

      for (const entry of accepted) {
        const profile = profiles.get(entry.investor)
        if (!profile) continue
        await store.insert('tax_documents', {
          investor_id: profile.id,
          offering_id: offering.id,
          document_id: null,
          kind: 'k1',
          tax_year: 2026,
          status: 'available',
          available_at: now,
          viewed_at: null,
        } as Omit<TaxDocument, 'id' | 'created_at' | 'updated_at'>)
      }
    }

    void waterfallId
  }
}

async function seedDisclosures(store: Store, offeringId: string): Promise<void> {
  const standard = [
    ['illiquidity', 'This investment cannot be sold', 'There is no public market for these securities and none is expected to develop. Be prepared to hold for the full term.'],
    ['loss_of_capital', 'You may lose your entire investment', 'Equity ranks behind every lender. If the asset sells for less than the debt against it, equity investors receive nothing.'],
    ['projections', 'Projections are not results', 'Every forward-looking figure is derived from assumptions the sponsor has stated. Actual results will differ.'],
    ['reimbursement', 'Revenue depends on government reimbursement', 'Rates are set politically and can change without regard to the facility’s own performance.'],
    ['operating_risk', 'Healthcare operations carry regulatory and staffing risk', 'Findings on survey can result in fines, admission holds or loss of licence.'],
    ['no_advice', 'CareCapital does not advise you', 'CareCapital Exchange is not your broker, adviser or fiduciary, and nothing here is a recommendation.'],
  ] as const

  for (const [key, title, body] of standard) {
    await store.insert('offering_disclosures', {
      offering_id: offeringId, key, title, body, version: 1, required: true,
    } as Omit<OfferingDisclosure, 'id' | 'created_at' | 'updated_at'>)
  }
}

async function seedWaterfall(store: Store, offeringId: string, promote: number): Promise<string> {
  const structure = await store.insert('waterfall_structures', {
    offering_id: offeringId,
    kind: 'preferred_return_promote',
    cumulative_preferred: true,
    has_catch_up: false,
    catch_up_pct: null,
  } as Omit<WaterfallStructure, 'id' | 'created_at' | 'updated_at'>)

  for (const tier of defaultTiers('preferred_return_promote', promote)) {
    await store.insert('waterfall_tiers', {
      waterfall_id: structure.id, ...tier,
    } as Omit<WaterfallTier, 'id' | 'created_at'>)
  }
  return structure.id
}

/**
 * Publishes a selection of the deal's real documents into the offering's data
 * room, at access levels that demonstrate the ladder.
 */
async function publishDealDocuments(store: Store, offeringId: string, dealId: string): Promise<void> {
  const documents = await store.select('documents', {
    where: { deal_id: dealId, deleted_at: { isNull: true } },
  })

  const tiers: { match: string[]; level: OfferingDocument['access_level']; category: OfferingDocument['category'] }[] = [
    { match: ['profit_and_loss'], level: 'public_teaser', category: 'financial_statements' },
    { match: ['balance_sheet', 'census'], level: 'verified_investor', category: 'financial_statements' },
    { match: ['appraisal'], level: 'interested_investor', category: 'appraisal' },
    { match: ['purchase_agreement'], level: 'committed_investor', category: 'purchase_agreement' },
  ]

  let order = 0
  for (const tier of tiers) {
    const document = documents.find((d) => tier.match.includes(d.doc_type))
    if (!document) continue
    await store.insert('offering_documents', {
      offering_id: offeringId,
      document_id: document.id,
      category: tier.category,
      access_level: tier.level,
      display_name: document.display_name,
      sort_order: order++,
    } as Omit<OfferingDocument, 'id' | 'created_at' | 'updated_at'>)
  }
}
