import type { Store } from '@/db'
import { resolveActor } from '@/lib/auth/session'
import { uploadDocument } from '@/services/documents'
import { processDocument } from '@/services/extraction'
import { createDeal } from '@/services/deals'
import { createOffering, publishOffering } from '@/services/equity/offerings'
import { round } from '@/lib/finance/calculations'
import { documentsFor } from './documents'
import { demoDealFixtures, DEMO_OPERATORS } from './demo-world'
import type { PeriodFixture } from './fixtures'
import type { Company, Deal, User } from '@/types'
import type { Offering } from '@/types/equity'

/**
 * Seeds the demonstration catalogue.
 *
 * Everything here goes through the ordinary services — `createDeal`,
 * `uploadDocument`, `processDocument`, `createOffering`, `publishOffering` —
 * rather than being written straight into tables. That is slower and it is the
 * point: a demonstration built by inserting rows would show a world the
 * product cannot actually produce, and the first thing that would break is the
 * thing a demonstration is for. The figures on a demonstration deal were
 * extracted from generated documents by the same code that handles a real
 * upload.
 *
 * The catalogue column is set after creation because `createDeal` has no
 * reason to know about environments. That keeps the concept out of the
 * ordinary deal path, where it would be one more thing to get wrong.
 */
export async function seedDemoCatalogue(
  store: Store,
  hashPassword: (raw: string) => Promise<string>,
  password: string,
): Promise<{ deals: number; offerings: number; facilities: number }> {
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)

  // --- the operators --------------------------------------------------------
  const companies = new Map<string, Company>()
  const owners = new Map<string, User>()

  for (const operator of DEMO_OPERATORS) {
    const company = await store.insert('companies', {
      name: operator.company,
      type: 'borrower',
      status: 'active',
      website: null,
      phone: null,
      address_line1: null,
      address_line2: null,
      city: operator.city,
      state: operator.state,
      zip: null,
      is_demo: true,
    } as never)
    companies.set(operator.slug, company)

    const seedUser = operator.users[0]!
    const user = await store.insert('users', {
      email: seedUser.email,
      full_name: seedUser.name,
      phone: null,
      role: 'borrower',
      password_hash: passwordHash,
      mfa_enabled: false,
      mfa_required: false,
      status: 'active',
      title: seedUser.title,
      last_login_at: now,
      notification_preferences: { in_app: true, email: false, sms: false, muted_events: [] },
    } as never)
    owners.set(operator.slug, user)

    await store.insert('company_members', {
      company_id: company.id, user_id: user.id, role: 'owner', invited_by: null,
      invited_at: now, accepted_at: now,
    } as never)
  }

  // --- the properties -------------------------------------------------------
  const fixtures = demoDealFixtures()
  const created: { deal: Deal; fixture: (typeof fixtures)[number] }[] = []
  let facilities = 0

  for (const fixture of fixtures) {
    const company = companies.get(fixture.borrower)
    const owner = owners.get(fixture.borrower)
    if (!company || !owner) continue
    const actor = await resolveActor(owner.id, company.id)
    if (!actor) continue

    const operator = DEMO_OPERATORS.find((o) => o.slug === fixture.borrower)!
    const deal = await createDeal({
      actor,
      name: fixture.name,
      assetType: fixture.assetType,
      transactionType: fixture.transactionType,
      borrowerPriority: 'lowest_rate',
      narrative: fixture.narrative,
      facility: {
        name: fixture.name,
        city: fixture.city,
        state: fixture.state,
        zip: fixture.zip,
        county: fixture.county,
        licensed_beds: fixture.licensedBeds,
        certified_beds: fixture.certifiedBeds,
        operating_beds: fixture.operatingBeds,
        current_census: fixture.currentCensus,
        occupancy_pct: fixture.spec.occupancy,
        year_built: fixture.yearBuilt,
        last_renovation_year: fixture.lastRenovation,
        cms_star_rating: fixture.cmsStars,
        operating_company: fixture.operatingCompany,
        management_company: fixture.managementCompany,
        real_estate_included: fixture.realEstateIncluded,
      },
      terms: {
        purchase_price: fixture.purchasePrice,
        appraised_value: fixture.appraisedValue,
        requested_financing: fixture.requestedFinancing,
        existing_debt: fixture.existingDebt,
        estimated_closing_costs: fixture.closingCosts,
        capex_requirement: fixture.capexRequirement,
        working_capital_requirement: fixture.workingCapital,
        requested_rate_pct: fixture.requestedRatePct,
        requested_term_months: fixture.requestedTermMonths,
        requested_amortization_months: fixture.requestedAmortMonths,
        requested_io_months: fixture.requestedIoMonths,
      },
      sponsor: {
        legal_entity: operator.sponsor.legalEntity,
        years_in_healthcare: operator.sponsor.yearsInHealthcare,
        years_operating_asset_type: operator.sponsor.yearsOperatingAssetType,
        facilities_operated: operator.sponsor.facilitiesOperated,
        beds_operated: operator.sponsor.bedsOperated,
        states_operated: operator.sponsor.statesOperated,
        historical_acquisitions: operator.sponsor.historicalAcquisitions,
        previous_exits: operator.sponsor.previousExits,
        prior_defaults: operator.sponsor.priorDefaults,
        net_worth: operator.sponsor.netWorth,
        liquidity: operator.sponsor.liquidity,
        management_team: operator.sponsor.managementTeam,
        relevant_experience: operator.sponsor.relevantExperience,
      },
    })

    // The catalogue this belongs to. Set here rather than inside `createDeal`,
    // which has no reason to know environments exist.
    // Not anonymised. The marketplace hides a real operator's identity until
    // an agreement is signed; a fictional operator has no identity to hide,
    // and a demonstration of fifteen raises all called "430-bed Skilled
    // Nursing Facility" shows nothing at all.
    await store.update('deals', deal.id, {
      environment: 'demo', is_demo: true, anonymize_in_marketplace: false,
    } as never)
    created.push({ deal, fixture })

    // Each building in the portfolio, so a demonstration can drill from the
    // raise into the individual asset the way a real portfolio deal does.
    const primary = await store.selectOne('facilities', { where: { deal_id: deal.id } })
    for (const building of fixture.spec.facilities.slice(1)) {
      await store.insert('facilities', {
        deal_id: deal.id,
        name: building.name,
        city: building.city,
        state: fixture.state,
        zip: fixture.zip,
        county: fixture.county,
        licensed_beds: building.beds,
        certified_beds: building.beds,
        operating_beds: building.beds,
        current_census: Math.round(building.beds * (fixture.spec.occupancy / 100)),
        occupancy_pct: fixture.spec.occupancy,
        year_built: building.built,
        last_renovation_year: building.built + 18,
        cms_star_rating: building.stars,
        operating_company: fixture.operatingCompany,
        management_company: fixture.managementCompany,
        real_estate_included: true,
        medicare_provider_number: null,
        medicaid_provider_number: null,
        license_number: null,
        license_expiry: null,
      } as never)
    }
    facilities += fixture.spec.facilities.length
    void primary

    // --- the financial record, and the documents it came out of -------------
    const ttm = buildTtm(fixture.periods)
    for (const generated of documentsFor(fixture, ttm)) {
      const record = await uploadDocument({
        actor,
        dealId: deal.id,
        filename: generated.filename,
        mimeType: generated.mimeType,
        data: Buffer.from(generated.content, 'utf8'),
        docType: generated.docType,
        displayName: generated.displayName,
        processing: 'none',
      })
      await store.update('documents', record.id, { is_demo: true } as never)
      await processDocument(record.id).catch(() => undefined)
    }
  }

  // --- the raises -----------------------------------------------------------
  let offerings = 0
  const adminMember = await store.selectOne('company_members', {})
  const admin = await store.selectOne('users', { where: { role: 'admin' } })

  for (const { deal, fixture } of created) {
    const company = companies.get(fixture.borrower)!
    const owner = owners.get(fixture.borrower)!
    const actor = await resolveActor(owner.id, company.id)
    if (!actor) continue

    const spec = fixture.spec
    const offering = await createOffering(actor, deal.id, {
      name: `${spec.name} Equity`,
      offering_type: 'reg_d_506b',
      issuer_entity: `${spec.name} Holdings LLC`,
      target_raise: spec.targetRaise,
      minimum_investment: spec.minimum,
      maximum_investment: Math.round(spec.targetRaise * 0.2),
      legal_structure: 'Delaware limited liability company',
      terms: {
        capital_position: 'common_equity',
        target_hold_months: spec.holdYears * 12,
        preferred_return_pct: 0.08,
        target_irr_pct: spec.targetIrrPct,
        target_cash_on_cash_pct: round(spec.margin * 100 * 0.6, 1),
        sponsor_promote_pct: 0.2,
        distribution_frequency: 'quarterly',
        acquisition_fee_pct: 0.01,
        asset_management_fee_pct: 0.015,
        disposition_fee_pct: 0.01,
        assumptions: {
          hold_years: spec.holdYears,
          exit_cap_rate_pct: 11.5,
          exit_multiple_of_ebitda: null,
          revenue_growth_pct: 3,
          expense_growth_pct: 2.8,
          occupancy_stabilized_pct: Math.min(93, spec.occupancy + 3),
          capex_per_bed: 420,
          selling_costs_pct: 2,
          notes: 'Illustrative assumptions for a fictional demonstration offering.',
        },
      },
    })

    await store.update('offerings', offering.id, { environment: 'demo' } as never)

    const reviewer = admin && adminMember
      ? await resolveActor(admin.id, adminMember.company_id)
      : null
    if (reviewer?.isAdmin) {
      await publishOffering(reviewer, offering.id).catch(() => undefined)
      // Publishing writes the row again, so the catalogue is restated after it.
      await store.update('offerings', offering.id, { environment: 'demo' } as never)
      // A raise with nothing in it looks like a raise nobody wanted. Committed
      // capital is set directly because there are no demonstration investors
      // behind it — and stating that here is better than inventing a hundred
      // fictional people to make one progress bar look right.
      await store.update('offerings', offering.id, {
        committed_amount: Math.round(spec.targetRaise * (0.18 + (spec.targetIrrPct % 5) / 20)),
      } as Partial<Offering>)
      offerings++
    }
  }

  return { deals: created.length, offerings, facilities }
}

/** The trailing-twelve-months period, built the way the debt seed builds it. */
function buildTtm(periods: PeriodFixture[]): PeriodFixture & { endDate: string; label: string } {
  const latest = periods[periods.length - 1]!
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  const growth = 1.023
  const scaled = (value: number) => Math.round(value * growth)
  return {
    ...latest,
    year: end.getUTCFullYear(),
    revenue: scaled(latest.revenue),
    labor_expense: scaled(latest.labor_expense),
    agency_labor: Math.round(latest.agency_labor * 0.92),
    utilities: scaled(latest.utilities),
    insurance: scaled(latest.insurance),
    taxes: scaled(latest.taxes),
    management_fee: scaled(latest.management_fee),
    total_operating_expense: scaled(latest.total_operating_expense),
    ebitda: scaled(latest.ebitda),
    net_income: scaled(latest.net_income),
    endDate: end.toISOString().slice(0, 10),
    label: `TTM ${end.toISOString().slice(0, 7)}`,
  }
}
