import { hashPassword } from '@/lib/auth/password'
import type { Store } from '@/db/store'
import { setNotificationsSuppressed } from '@/services/notifications'
import { documentsFor } from './documents'
import {
  ADMIN_USER, BORROWERS, DEALS, DEMO_PASSWORD, LENDERS,
  type DealFixture, type PeriodFixture,
} from './fixtures'
import type {
  Company, CompanyMember, Deal, DealStatus, Facility, FacilityMetric, FinancialLineItem,
  FinancialPeriod, Lender, LendingBox, LineItemKey, Sponsor, TransactionTerms, User,
} from '@/types'

/**
 * Demo data seeding.
 *
 * Everything here runs the real product code paths: documents are written to
 * the storage driver and processed by the actual extraction pipeline,
 * discrepancies come from the real reconciliation detectors, scores come from
 * the real underwriting engine, and matches come from the real matching engine.
 *
 * The result is a demo you can trust as a demonstration — if a number looks
 * wrong here, the engine that produced it is wrong.
 */

const LINE_ITEM_MAP: [keyof PeriodFixture, LineItemKey][] = [
  ['revenue', 'revenue'],
  ['labor_expense', 'labor_expense'],
  ['agency_labor', 'agency_labor'],
  ['rent', 'rent'],
  ['utilities', 'utilities'],
  ['insurance', 'insurance'],
  ['taxes', 'taxes'],
  ['management_fee', 'management_fee'],
  ['capex', 'capex'],
  ['total_operating_expense', 'total_operating_expense'],
  ['ebitda', 'ebitda'],
  ['net_income', 'net_income'],
]

/** Trailing-twelve-month period ending at the close of last month. */
function buildTtm(deal: DealFixture): PeriodFixture & { endDate: string; label: string } {
  const latest = deal.periods[deal.periods.length - 1]!
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  const growth = 1.023
  const scaled = <K extends keyof PeriodFixture>(key: K) => Math.round((latest[key] as number) * growth)
  return {
    ...latest,
    year: end.getUTCFullYear(),
    revenue: scaled('revenue'),
    labor_expense: scaled('labor_expense'),
    agency_labor: Math.round(latest.agency_labor * 0.92),
    utilities: scaled('utilities'),
    insurance: scaled('insurance'),
    taxes: scaled('taxes'),
    management_fee: scaled('management_fee'),
    capex: latest.capex,
    total_operating_expense: scaled('total_operating_expense'),
    ebitda: scaled('ebitda'),
    net_income: scaled('net_income'),
    endDate: end.toISOString().slice(0, 10),
    label: `TTM ${end.toISOString().slice(0, 7)}`,
  }
}

const STATUS_MAP: Record<DealFixture['status'], DealStatus> = {
  draft: 'draft',
  ready: 'ready_for_distribution',
  distributed: 'distributed',
  indications: 'indications_received',
}

export async function seedDemoData(store: Store): Promise<void> {
  setNotificationsSuppressed(true)
  try {
    await seed(store)
  } finally {
    setNotificationsSuppressed(false)
  }
}

async function seed(store: Store): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const now = new Date().toISOString()

  const makeUser = (email: string, name: string, title: string, role: User['role']) =>
    store.insert('users', {
      email,
      full_name: name,
      phone: null,
      role,
      password_hash: passwordHash,
      mfa_enabled: false,
      mfa_required: role === 'lender' || role === 'admin',
      status: 'active',
      title,
      last_login_at: now,
      notification_preferences: { in_app: true, email: true, sms: false, muted_events: [] },
    } as Omit<User, 'id' | 'created_at' | 'updated_at'>)

  const makeCompany = (name: string, type: Company['type'], city: string, state: string) =>
    store.insert('companies', {
      name, type, website: null, description: null, address_line1: null,
      city, state, zip: null, status: 'active',
    } as Omit<Company, 'id' | 'created_at' | 'updated_at'>)

  const link = (companyId: string, userId: string, role: CompanyMember['role']) =>
    store.insert('company_members', { company_id: companyId, user_id: userId, role } as Omit<CompanyMember, 'id' | 'created_at'>)

  // --- Platform administrator ---------------------------------------------
  const adminCompany = await makeCompany(ADMIN_USER.company, 'admin', 'New York', 'NY')
  const adminUser = await makeUser(ADMIN_USER.email, ADMIN_USER.name, ADMIN_USER.title, 'admin')
  await link(adminCompany.id, adminUser.id, 'owner')

  // --- Borrowers -----------------------------------------------------------
  const borrowerCompanies = new Map<string, Company>()
  const borrowerOwners = new Map<string, User>()
  for (const fixture of BORROWERS) {
    const company = await makeCompany(fixture.company, 'borrower', fixture.city, fixture.state)
    borrowerCompanies.set(fixture.slug, company)
    for (const member of fixture.users) {
      const user = await makeUser(member.email, member.name, member.title, 'borrower')
      await link(company.id, user.id, member.role)
      if (member.role === 'owner') borrowerOwners.set(fixture.slug, user)
    }
    await store.insert('subscriptions', {
      company_id: company.id,
      plan_key: fixture.slug === 'meridian' ? 'borrower_pro' : 'borrower_standard',
      status: 'active',
      seats: fixture.users.length,
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      external_id: null,
    } as never)
  }

  // --- Lenders -------------------------------------------------------------
  const lenderRecords = new Map<string, Lender>()
  for (const fixture of LENDERS) {
    const company = await makeCompany(fixture.company, 'lender', '', '')
    const user = await makeUser(fixture.contactEmail, fixture.contactName, 'Head of Healthcare Originations', 'lender')
    await link(company.id, user.id, 'owner')

    const lender = await store.insert('lenders', {
      company_id: company.id,
      institution_name: fixture.institutionName,
      institution_type: fixture.institutionType,
      description: fixture.description,
      logo_initials: fixture.initials,
      verification_status: fixture.verification,
      verified_at: fixture.verification === 'verified' ? now : null,
      verified_by: fixture.verification === 'verified' ? adminUser.id : null,
      contact_name: fixture.contactName,
      contact_email: fixture.contactEmail,
      contact_phone: null,
      public_profile_fields: ['description', 'asset_types', 'states', 'loan_range', 'transaction_types', 'typical_term'],
      responsiveness_score: fixture.responsiveness,
      is_demo: true,
    } as Omit<Lender, 'id' | 'created_at' | 'updated_at'>)
    lenderRecords.set(fixture.slug, lender)

    await store.insert('lender_lending_boxes', {
      lender_id: lender.id,
      name: 'Primary lending box',
      active: true,
      min_loan: fixture.box.minLoan,
      max_loan: fixture.box.maxLoan,
      max_ltv_pct: fixture.box.maxLtvPct,
      min_dscr: fixture.box.minDscr,
      min_debt_yield_pct: fixture.box.minDebtYieldPct,
      min_occupancy_pct: fixture.box.minOccupancyPct,
      states: fixture.box.states,
      excluded_states: fixture.box.excludedStates,
      asset_types: fixture.box.assetTypes,
      excluded_asset_types: [],
      transaction_types: fixture.box.transactionTypes,
      min_operator_years: fixture.box.minOperatorYears,
      min_facilities_operated: fixture.box.minFacilitiesOperated,
      max_medicaid_pct: fixture.box.maxMedicaidPct,
      min_private_pay_pct: null,
      preferred_deal_size: fixture.box.preferredDealSize,
      loan_purposes: fixture.box.transactionTypes,
      typical_rate_low_pct: fixture.box.typicalRateLow,
      typical_rate_high_pct: fixture.box.typicalRateHigh,
      typical_term_months: fixture.box.typicalTermMonths,
      requires_appraisal: fixture.box.requiresAppraisal,
      requires_environmental: fixture.box.requiresEnvironmental,
      required_tax_return_years: fixture.box.taxReturnYears,
      notes: fixture.box.notes,
    } as Omit<LendingBox, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('subscriptions', {
      company_id: company.id,
      plan_key: fixture.slug === 'national' ? 'lender_enterprise' : 'lender_professional',
      status: 'active',
      seats: 5,
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      external_id: null,
    } as never)
  }

  // --- Deals ---------------------------------------------------------------
  const dealRecords: { deal: Deal; fixture: DealFixture; ttm: ReturnType<typeof buildTtm> }[] = []
  let reference = 1001

  for (const fixture of DEALS) {
    const company = borrowerCompanies.get(fixture.borrower)!
    const owner = borrowerOwners.get(fixture.borrower)!
    const borrowerFixture = BORROWERS.find((b) => b.slug === fixture.borrower)!
    const ttm = buildTtm(fixture)

    const deal = await store.insert('deals', {
      reference: `CCX-${reference++}`,
      company_id: company.id,
      created_by: owner.id,
      name: fixture.name,
      asset_type: fixture.assetType,
      transaction_type: fixture.transactionType,
      status: STATUS_MAP[fixture.status],
      distribution_scope: fixture.status === 'draft' ? 'private' : 'matched_lenders',
      anonymize_in_marketplace: true,
      borrower_priority:
        fixture.slug === 'brookfield' ? 'highest_leverage'
        : fixture.slug === 'willow-creek' ? 'fastest_closing'
        : 'lowest_rate',
      target_close_date: new Date(Date.now() + fixture.targetCloseInDays * 86_400_000).toISOString(),
      narrative: fixture.narrative,
      is_demo: true,
      distributed_at: null,
    } as Omit<Deal, 'id' | 'created_at' | 'updated_at'>)

    const facility = await store.insert('facilities', {
      deal_id: deal.id,
      name: fixture.name,
      address_line1: `${100 + reference} ${fixture.county} Road`,
      city: fixture.city,
      state: fixture.state,
      zip: fixture.zip,
      county: fixture.county,
      licensed_beds: fixture.licensedBeds,
      certified_beds: fixture.certifiedBeds,
      operating_beds: fixture.operatingBeds,
      current_census: fixture.currentCensus,
      occupancy_pct: Math.round((fixture.currentCensus / fixture.operatingBeds) * 1000) / 10,
      ownership_structure: 'Single-asset LLC, real estate and operations under common ownership',
      year_built: fixture.yearBuilt,
      last_renovation_year: fixture.lastRenovation,
      property_type: 'Freestanding skilled nursing facility',
      real_estate_included: fixture.realEstateIncluded,
      operating_company: fixture.operatingCompany,
      management_company: fixture.managementCompany,
      cms_star_rating: fixture.cmsStars,
    } as Omit<Facility, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('transaction_terms', {
      deal_id: deal.id,
      purchase_price: fixture.purchasePrice,
      requested_financing: fixture.requestedFinancing,
      existing_debt: fixture.existingDebt,
      seller_financing: fixture.sellerFinancing,
      cash_equity: null,
      appraised_value: fixture.appraisedValue,
      estimated_closing_costs: fixture.closingCosts,
      working_capital_requirement: fixture.workingCapital,
      capex_requirement: fixture.capexRequirement,
      target_close_date: new Date(Date.now() + fixture.targetCloseInDays * 86_400_000).toISOString(),
      purchase_agreement_status: fixture.purchasePrice ? 'Executed, diligence period open' : null,
      loi_status: fixture.purchasePrice ? 'Superseded by executed agreement' : null,
      requested_term_months: fixture.requestedTermMonths,
      requested_amortization_months: fixture.requestedAmortMonths,
      requested_rate_pct: fixture.requestedRatePct,
      requested_io_months: fixture.requestedIoMonths,
    } as Omit<TransactionTerms, 'id' | 'created_at' | 'updated_at'>)

    await store.insert('sponsors', {
      deal_id: deal.id,
      legal_entity: borrowerFixture.sponsor.legalEntity,
      years_in_healthcare: borrowerFixture.sponsor.yearsInHealthcare,
      years_operating_asset_type: borrowerFixture.sponsor.yearsOperatingAssetType,
      facilities_operated: borrowerFixture.sponsor.facilitiesOperated,
      beds_operated: borrowerFixture.sponsor.bedsOperated,
      states_operated: borrowerFixture.sponsor.statesOperated,
      historical_acquisitions: borrowerFixture.sponsor.historicalAcquisitions,
      previous_exits: borrowerFixture.sponsor.previousExits,
      prior_defaults: borrowerFixture.sponsor.priorDefaults,
      bankruptcy_history: false,
      management_team: borrowerFixture.sponsor.managementTeam,
      key_executives: null,
      net_worth: borrowerFixture.sponsor.netWorth,
      liquidity: borrowerFixture.sponsor.liquidity,
      relevant_experience: borrowerFixture.sponsor.relevantExperience,
    } as Omit<Sponsor, 'id' | 'created_at' | 'updated_at'>)

    // Historical periods, entered by the borrower and therefore approved.
    const allPeriods: (PeriodFixture & { endDate?: string; label?: string })[] = [...fixture.periods, ttm]
    for (const period of allPeriods) {
      const isTtm = period === (ttm as unknown as PeriodFixture)
      const record = await store.insert('financial_periods', {
        deal_id: deal.id,
        label: isTtm ? ttm.label : String(period.year),
        period_type: isTtm ? 'ttm' : 'annual',
        fiscal_year: period.year,
        start_date: isTtm
          ? new Date(new Date(ttm.endDate).getTime() - 364 * 86_400_000).toISOString().slice(0, 10)
          : `${period.year}-01-01`,
        end_date: isTtm ? ttm.endDate : `${period.year}-12-31`,
        source: 'demo',
        is_primary: isTtm,
      } as Omit<FinancialPeriod, 'id' | 'created_at'>)

      await store.insertMany(
        'financial_line_items',
        LINE_ITEM_MAP.map(([source, key]) => ({
          period_id: record.id,
          deal_id: deal.id,
          key,
          label: key,
          value: period[source] as number,
          proposed_value: null,
          approved_value: period[source] as number,
          approved_by: owner.id,
          approved_at: now,
          source_document_id: null,
          source_page: null,
          confidence: 1,
        })) as Omit<FinancialLineItem, 'id' | 'created_at' | 'updated_at'>[],
      )

      await store.insert('facility_metrics', {
        facility_id: facility.id,
        deal_id: deal.id,
        period_label: isTtm ? ttm.label : String(period.year),
        period_end: isTtm ? ttm.endDate : `${period.year}-12-31`,
        occupancy_pct: period.occupancy_pct,
        average_census: period.average_census,
        medicare_pct: fixture.payer.medicare,
        medicaid_pct: fixture.payer.medicaid,
        private_pay_pct: fixture.payer.privatePay,
        managed_care_pct: fixture.payer.managedCare,
        other_payer_pct: fixture.payer.other,
        average_daily_rate: Math.round(period.revenue / (period.average_census * 365)),
        revenue_per_patient_day: Math.round(period.revenue / (period.average_census * 365)),
        labor_hours_per_patient_day: Math.round((3.4 + (period.occupancy_pct - 85) * 0.01) * 100) / 100,
        agency_labor_pct: Math.round((period.agency_labor / period.labor_expense) * 1000) / 10,
      } as Omit<FacilityMetric, 'id' | 'created_at'>)
    }

    dealRecords.push({ deal, fixture, ttm })
  }

  // --- Documents, processed by the real pipeline ---------------------------
  const { uploadDocument } = await import('@/services/documents')
  const { processDocument } = await import('@/services/extraction')
  const { resolveActor } = await import('@/lib/auth/session')

  for (const { deal, fixture, ttm } of dealRecords) {
    const company = borrowerCompanies.get(fixture.borrower)!
    const owner = borrowerOwners.get(fixture.borrower)!
    const actor = await resolveActor(owner.id, company.id)
    if (!actor) continue

    // The draft deal deliberately has no documents, so the product has a deal
    // that demonstrates the empty state and the readiness checklist.
    if (fixture.status === 'draft') continue

    for (const generated of documentsFor(fixture, ttm)) {
      const record = await uploadDocument({
        actor,
        dealId: deal.id,
        filename: generated.filename,
        mimeType: generated.mimeType,
        data: Buffer.from(generated.content, 'utf8'),
        docType: generated.docType,
        displayName: generated.displayName,
        // Extraction is driven directly below so the seeded database is
        // complete when seeding returns; reconciliation and matching run once
        // per deal afterwards rather than once per document.
        processing: 'none',
      })
      await store.update('documents', record.id, { is_demo: true })
      await processDocument(record.id).catch((error) => {
        console.error('[seed] document processing failed', generated.filename, error)
      })
    }
  }

  // --- Reconciliation, underwriting, memos, matches ------------------------
  const { runReconciliation, resolveDiscrepancy } = await import('@/services/discrepancies')
  const { runUnderwriting } = await import('@/services/underwriting')
  const { generateCreditMemo } = await import('@/services/memo')
  const { computeMatches } = await import('@/services/matching')

  for (const { deal, fixture } of dealRecords) {
    await runReconciliation(deal.id)
    if (fixture.status === 'draft') continue

    const company = borrowerCompanies.get(fixture.borrower)!
    const owner = borrowerOwners.get(fixture.borrower)!
    const actor = await resolveActor(owner.id, company.id)
    if (!actor) continue

    // Approve the figures extraction proposed, as a borrower working through
    // the review queue would. This is the human half of the approval rule, and
    // it writes the same audit trail a real approval writes.
    const { approveLineItem } = await import('@/services/deals')
    const pendingItems = await store.select('financial_line_items', {
      where: { deal_id: deal.id, approved_value: null },
    })
    for (const item of pendingItems) {
      if (item.proposed_value === null) continue
      await approveLineItem(actor, item.id, item.proposed_value)
    }

    // Only the deals that actually went to market had their blocking items
    // worked through — that is what made them distributable. The deals still in
    // preparation keep their open items, so the discrepancy centre demonstrates
    // real content rather than an empty state.
    if (fixture.status === 'distributed' || fixture.status === 'indications') {

      const open = await store.select('discrepancies', { where: { deal_id: deal.id, status: 'open' } })
      for (const discrepancy of open) {
        if (discrepancy.severity !== 'critical' && discrepancy.severity !== 'high') continue
        await resolveDiscrepancy({
          actor,
          discrepancyId: discrepancy.id,
          action: 'resolve',
          note: discrepancy.category === 'missing_document'
            ? 'Provided to the deal team and uploaded to the data room.'
            : 'Reviewed with the operator; the operating statements are the figure of record and the variance was a timing difference.',
        })
      }
    }

    await runUnderwriting(deal.id, { actor, force: true })
    await generateCreditMemo(deal.id, actor).catch((error) =>
      console.error('[seed] memo generation failed', deal.reference, error),
    )
    await computeMatches(deal.id)
  }

  // --- Distribution and indications ---------------------------------------
  // Notifications are re-enabled here: the events from this point on — a deal
  // going out, an indication arriving — are the ones a user should actually
  // find waiting in their inbox.
  setNotificationsSuppressed(false)
  const { distributeDeal } = await import('@/services/distribution')
  const { submitIndication } = await import('@/services/indications')
  const { matchesForDeal } = await import('@/services/matching')

  for (const { deal, fixture } of dealRecords) {
    if (fixture.status !== 'distributed' && fixture.status !== 'indications') continue
    const company = borrowerCompanies.get(fixture.borrower)!
    const owner = borrowerOwners.get(fixture.borrower)!
    const actor = await resolveActor(owner.id, company.id)
    if (!actor) continue

    const matches = await matchesForDeal(deal.id)
    const targets = matches.slice(0, 4).map((m) => m.lender.id)
    if (!targets.length) continue

    // Two of the deals also go onto the marketplace, so the demo shows both
    // postures: a deal shared only with named lenders, and one discoverable by
    // any verified lender under its anonymised label.
    const scope = ['lakeview', 'northgate'].includes(fixture.slug) ? 'marketplace' : 'matched_lenders'
    await distributeDeal({
      actor,
      dealId: deal.id,
      scope,
      lenderIds: targets,
    }).catch((error) => console.error('[seed] distribution failed', deal.reference, error.message ?? error))

    if (fixture.status !== 'indications') continue

    // Two or three indications per deal, priced off each lender's own range.
    const bidders = matches.slice(0, 3)
    for (const [index, { lender }] of bidders.entries()) {
      const lenderFixture = LENDERS.find((l) => l.institutionName === lender.institution_name)
      if (!lenderFixture) continue
      const lenderCompany = await store.findById('companies', lender.company_id)
      const lenderMember = await store.selectOne('company_members', { where: { company_id: lender.company_id } })
      if (!lenderCompany || !lenderMember) continue
      const lenderActor = await resolveActor(lenderMember.user_id, lenderCompany.id)
      if (!lenderActor) continue

      const spread = index * 0.35
      const rate = Math.round((lenderFixture.box.typicalRateLow + spread) * 100) / 100
      const proceeds = Math.round(
        Math.min(fixture.requestedFinancing, (fixture.appraisedValue ?? fixture.purchasePrice ?? 0) * (lenderFixture.box.maxLtvPct / 100)) / 50_000,
      ) * 50_000

      await submitIndication(lenderActor, deal.id, {
        loan_amount: proceeds || fixture.requestedFinancing,
        rate_type: index === 2 ? 'floating' : 'fixed',
        index_name: index === 2 ? 'SOFR (30-day average)' : null,
        index_rate_pct: index === 2 ? 4.15 : null,
        spread_pct: index === 2 ? Math.round((rate - 4.15) * 100) / 100 : null,
        all_in_rate_pct: rate,
        term_months: lenderFixture.box.typicalTermMonths,
        amortization_months: 300,
        interest_only_months: index === 0 ? 12 : index === 1 ? 0 : 24,
        origination_fee_pct: index === 0 ? 1 : index === 1 ? 0.75 : 1.5,
        exit_fee_pct: index === 2 ? 0.5 : 0,
        prepayment_terms:
          index === 1 ? '5-4-3-2-1 declining prepayment premium' : 'Open to prepayment after 24 months at par',
        recourse: index === 2 ? 'non_recourse' : index === 0 ? 'partial_recourse' : 'full_recourse',
        guarantees: index === 2 ? 'Bad-boy carve-outs only' : 'Full personal guarantee from the principals',
        covenants: 'Minimum 1.25x DSCR tested quarterly; minimum 80% occupancy tested quarterly',
        closing_timeline_days: 45 + index * 15,
        expires_at: new Date(Date.now() + (21 + index * 7) * 86_400_000).toISOString(),
        additional_terms:
          index === 0
            ? 'Subject to satisfactory review of the updated appraisal and a Phase I environmental report.'
            : 'Subject to credit committee approval and satisfactory completion of diligence.',
        is_commitment: false,
        conditions: [
          { label: 'Satisfactory third-party appraisal', kind: 'condition' },
          { label: 'Licensure transfer approval', kind: 'condition' },
          ...(index === 0 ? [{ label: 'Phase I environmental site assessment', kind: 'diligence_item' as const }] : []),
          { label: 'Minimum 1.25x DSCR tested quarterly', kind: 'covenant' as const },
        ],
      }).catch((error) => console.error('[seed] indication failed', deal.reference, error))
    }
  }

  // --- A lender question thread on the flagship deal -----------------------
  const flagship = dealRecords.find((d) => d.fixture.slug === 'lakeview')
  const midwest = lenderRecords.get('midwest')
  if (flagship && midwest) {
    const { openThread, postMessage } = await import('@/services/messages')
    const lenderCompany = await store.findById('companies', midwest.company_id)
    const lenderMember = await store.selectOne('company_members', { where: { company_id: midwest.company_id } })
    const borrowerCompany = borrowerCompanies.get(flagship.fixture.borrower)!
    const borrowerOwner = borrowerOwners.get(flagship.fixture.borrower)!

    if (lenderCompany && lenderMember) {
      const lenderActor = await resolveActor(lenderMember.user_id, lenderCompany.id)
      const borrowerActor = await resolveActor(borrowerOwner.id, borrowerCompany.id)
      if (lenderActor && borrowerActor) {
        const thread = await openThread(
          lenderActor,
          flagship.deal.id,
          'Agency labor detail and staffing plan',
          'The agency line has come down materially over the last two years, which is encouraging. Could you provide the monthly agency spend for the trailing twelve months, along with the current permanent headcount by shift? We would also like to understand what changed operationally to drive the reduction.',
        )
        await postMessage(
          borrowerActor,
          thread.thread.id,
          'Happy to. The reduction followed a new administrator and DON hired in early 2024, plus a shift differential programme that let us convert most night coverage to permanent staff. We will upload the monthly agency detail and the staffing roster today.',
        )
      }
    }

    // A private internal note, visible only inside the lender organisation.
    await store.insert('lender_notes', {
      deal_id: flagship.deal.id,
      lender_id: midwest.id,
      author_id: lenderMember?.user_id ?? adminUser.id,
      body: 'Credit committee reaction was positive on the coverage but they want the agency trend confirmed with monthly detail before we go firm. Internal target is 72% LTV rather than the 75% requested.',
    } as never)
  }

  // --- A saved search with alerts, for the marketplace alerts feature ------
  const communityLender = lenderRecords.get('community')
  if (communityLender) {
    const member = await store.selectOne('company_members', { where: { company_id: communityLender.company_id } })
    if (member) {
      await store.insert('saved_searches', {
        user_id: member.user_id,
        company_id: communityLender.company_id,
        name: 'Upper Midwest SNF, $2M–$12M, conservative leverage',
        kind: 'lender_marketplace',
        criteria: {
          states: ['IA', 'MN', 'WI', 'MO'],
          asset_types: ['snf'],
          min_loan: 2_000_000,
          max_loan: 12_000_000,
          max_ltv_pct: 75,
          min_dscr: 1.4,
        },
        alert_enabled: true,
        last_alert_at: null,
      } as never)
    }
  }

  // --- Equity marketplace ---------------------------------------------------
  // Runs last: offerings attach to deals the debt seed has already created and
  // processed, so an investor sees the same documents and figures a lender does.
  const { seedEquityDemo } = await import('./equity-seed')
  await seedEquityDemo(store, hashPassword)
}
