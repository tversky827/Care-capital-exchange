import type { AssetType, LenderInstitutionType, TransactionType } from '@/types'

/**
 * Demo fixtures.
 *
 * Every organisation, facility and figure below is fictional. The lender names
 * are invented and do not correspond to real institutions. Financial profiles
 * are modelled on realistic skilled nursing operating economics so that the
 * underwriting, matching and reconciliation engines are exercised against data
 * with the same shape as production data — including deals that do not work.
 */

export const DEMO_PASSWORD = 'DemoPass123!'
export const DEMO_BANNER = 'DEMO DATA — NOT REAL TRANSACTIONS'

export interface PeriodFixture {
  year: number
  revenue: number
  labor_expense: number
  agency_labor: number
  rent: number
  utilities: number
  insurance: number
  taxes: number
  management_fee: number
  capex: number
  total_operating_expense: number
  ebitda: number
  net_income: number
  occupancy_pct: number
  average_census: number
}

export interface DealFixture {
  slug: string
  borrower: string
  name: string
  assetType: AssetType
  transactionType: TransactionType
  city: string
  state: string
  zip: string
  county: string
  licensedBeds: number
  certifiedBeds: number
  operatingBeds: number
  currentCensus: number
  yearBuilt: number
  lastRenovation: number | null
  cmsStars: number | null
  operatingCompany: string
  managementCompany: string | null
  realEstateIncluded: boolean
  purchasePrice: number | null
  appraisedValue: number | null
  requestedFinancing: number
  existingDebt: number | null
  sellerFinancing: number | null
  closingCosts: number | null
  capexRequirement: number | null
  workingCapital: number | null
  requestedRatePct: number | null
  requestedTermMonths: number | null
  requestedAmortMonths: number | null
  requestedIoMonths: number | null
  targetCloseInDays: number
  payer: { medicare: number; medicaid: number; managedCare: number; privatePay: number; other: number }
  periods: PeriodFixture[]
  narrative: string
  /** Introduces a deliberate conflict between two documents. */
  taxReturnRevenueOverride?: number
  status: 'ready' | 'distributed' | 'indications' | 'draft'
}

export interface BorrowerFixture {
  slug: string
  company: string
  city: string
  state: string
  users: { email: string; name: string; title: string; role: 'owner' | 'admin' | 'member' | 'viewer' }[]
  sponsor: {
    legalEntity: string
    yearsInHealthcare: number
    yearsOperatingAssetType: number
    facilitiesOperated: number
    bedsOperated: number
    statesOperated: string[]
    historicalAcquisitions: number
    previousExits: number
    priorDefaults: boolean
    netWorth: number
    liquidity: number
    managementTeam: string
    relevantExperience: string
  }
}

export interface LenderFixture {
  slug: string
  company: string
  institutionName: string
  institutionType: LenderInstitutionType
  initials: string
  description: string
  contactName: string
  contactEmail: string
  responsiveness: number
  verification: 'verified' | 'pending'
  box: {
    minLoan: number
    maxLoan: number
    maxLtvPct: number
    minDscr: number
    minDebtYieldPct: number
    minOccupancyPct: number
    states: string[]
    excludedStates: string[]
    assetTypes: AssetType[]
    transactionTypes: TransactionType[]
    minOperatorYears: number
    minFacilitiesOperated: number
    maxMedicaidPct: number | null
    preferredDealSize: number
    typicalRateLow: number
    typicalRateHigh: number
    typicalTermMonths: number
    requiresAppraisal: boolean
    requiresEnvironmental: boolean
    taxReturnYears: number
    notes: string
  }
}

// ---------------------------------------------------------------------------

export const BORROWERS: BorrowerFixture[] = [
  {
    slug: 'meridian',
    company: 'Meridian Senior Operations',
    city: 'Chicago',
    state: 'IL',
    users: [
      { email: 'dana@meridiansenior.demo', name: 'Dana Whitfield', title: 'Chief Financial Officer', role: 'owner' },
      { email: 'omar@meridiansenior.demo', name: 'Omar Castellanos', title: 'VP Finance', role: 'member' },
    ],
    sponsor: {
      legalEntity: 'Meridian Senior Operations LLC',
      yearsInHealthcare: 17,
      yearsOperatingAssetType: 14,
      facilitiesOperated: 9,
      bedsOperated: 1_048,
      statesOperated: ['IL', 'IN', 'WI', 'MN'],
      historicalAcquisitions: 11,
      previousExits: 3,
      priorDefaults: false,
      netWorth: 38_500_000,
      liquidity: 9_200_000,
      managementTeam:
        'Founded in 2009 by a two-partner team out of a regional multi-facility operator. The CFO has been with the group eleven years; regional operations are led by two former directors of nursing with combined thirty years in Illinois skilled nursing.',
      relevantExperience:
        'Nine facilities across four Midwest states, all acquired as distressed or underperforming assets and stabilised. Median occupancy across the portfolio has moved from 78% at acquisition to 89% currently.',
    },
  },
  {
    slug: 'bluestem',
    company: 'Bluestem Healthcare Partners',
    city: 'Des Moines',
    state: 'IA',
    users: [
      { email: 'priya@bluestemhealth.demo', name: 'Priya Raghunathan', title: 'Managing Partner', role: 'owner' },
      { email: 'jesse@bluestemhealth.demo', name: 'Jesse Ammons', title: 'Director of Capital Markets', role: 'admin' },
    ],
    sponsor: {
      legalEntity: 'Bluestem Healthcare Partners LP',
      yearsInHealthcare: 8,
      yearsOperatingAssetType: 6,
      facilitiesOperated: 4,
      bedsOperated: 486,
      statesOperated: ['IA', 'OH', 'WI', 'PA'],
      historicalAcquisitions: 5,
      previousExits: 1,
      priorDefaults: false,
      netWorth: 14_200_000,
      liquidity: 3_400_000,
      managementTeam:
        'Two managing partners from a healthcare private equity background, with day-to-day operations contracted to a third-party manager holding twenty-two facilities across the Midwest.',
      relevantExperience:
        'Four skilled nursing facilities acquired since 2019. One asset was exited in 2024 at a 1.9x equity multiple.',
    },
  },
  {
    slug: 'auburn',
    company: 'Auburn Care Group',
    city: 'Austin',
    state: 'TX',
    users: [
      { email: 'marcus@auburncare.demo', name: 'Marcus Delaney', title: 'President', role: 'owner' },
    ],
    sponsor: {
      legalEntity: 'Auburn Care Group Inc.',
      yearsInHealthcare: 4,
      yearsOperatingAssetType: 3,
      facilitiesOperated: 2,
      bedsOperated: 250,
      statesOperated: ['TX', 'MO'],
      historicalAcquisitions: 2,
      previousExits: 0,
      priorDefaults: false,
      netWorth: 6_100_000,
      liquidity: 1_150_000,
      managementTeam:
        'Founder previously ran a home health agency sold in 2021. Clinical leadership is provided by an administrator with nineteen years in Texas skilled nursing.',
      relevantExperience:
        'Two facilities acquired in 2022 and 2023. Both were at sub-70% occupancy at acquisition; one has stabilised above 85%.',
    },
  },
]

export const LENDERS: LenderFixture[] = [
  {
    slug: 'midwest',
    company: 'Midwest Healthcare Bank',
    institutionName: 'Midwest Healthcare Bank',
    institutionType: 'bank',
    initials: 'MH',
    description:
      'A regional commercial bank with a dedicated healthcare group covering the upper Midwest. Balance-sheet lender on skilled nursing and assisted living, with a preference for operators already established in the states we serve.',
    contactName: 'Rachel Nkemelu',
    contactEmail: 'healthcare@midwesthealthcarebank.demo',
    responsiveness: 88,
    verification: 'verified',
    box: {
      minLoan: 3_000_000, maxLoan: 25_000_000, maxLtvPct: 80, minDscr: 1.35, minDebtYieldPct: 11,
      minOccupancyPct: 80, states: ['IL', 'IN', 'WI', 'MO', 'IA', 'MN', 'OH'], excludedStates: [],
      assetTypes: ['snf', 'alf', 'memory_care'], transactionTypes: ['acquisition', 'refinance', 'acquisition_refinance', 'capex'],
      minOperatorYears: 5, minFacilitiesOperated: 2, maxMedicaidPct: 70, preferredDealSize: 10_000_000,
      typicalRateLow: 6.85, typicalRateHigh: 7.9, typicalTermMonths: 60,
      requiresAppraisal: true, requiresEnvironmental: true, taxReturnYears: 3,
      notes: 'Prefers borrowers with an existing operating footprint in our states. Will consider first-time acquirers with an experienced third-party manager under contract.',
    },
  },
  {
    slug: 'northeast',
    company: 'Northeast Senior Housing Finance',
    institutionName: 'Northeast Senior Housing Finance',
    institutionType: 'specialty_finance',
    initials: 'NE',
    description:
      'Specialty finance company focused exclusively on senior housing and post-acute care in the Northeast and Mid-Atlantic. Bridge-to-agency and stabilised balance-sheet financing.',
    contactName: 'Thomas Beckett',
    contactEmail: 'originations@nesenior.demo',
    responsiveness: 72,
    verification: 'verified',
    box: {
      minLoan: 5_000_000, maxLoan: 40_000_000, maxLtvPct: 75, minDscr: 1.3, minDebtYieldPct: 10.5,
      minOccupancyPct: 78, states: ['PA', 'NY', 'NJ', 'CT', 'MA', 'MD', 'DE', 'RI', 'NH', 'VT', 'ME'],
      excludedStates: [], assetTypes: ['snf', 'alf', 'memory_care', 'behavioral_health'],
      transactionTypes: ['acquisition', 'refinance', 'bridge', 'acquisition_refinance', 'recapitalization'],
      minOperatorYears: 3, minFacilitiesOperated: 1, maxMedicaidPct: null, preferredDealSize: 15_000_000,
      typicalRateLow: 8.25, typicalRateHigh: 10.5, typicalTermMonths: 36,
      requiresAppraisal: true, requiresEnvironmental: false, taxReturnYears: 2,
      notes: 'Comfortable with Medicaid-weighted census where the state rate environment supports it. Bridge structures with 24 months interest-only are our most common execution.',
    },
  },
  {
    slug: 'national',
    company: 'National Healthcare Credit',
    institutionName: 'National Healthcare Credit',
    institutionType: 'debt_fund',
    initials: 'NC',
    description:
      'Nationwide debt fund providing higher-leverage financing across the healthcare real estate spectrum. We size to cash flow and will go beyond conventional bank leverage where the operating story supports it.',
    contactName: 'Yusuf Adeyemi',
    contactEmail: 'deals@nationalhealthcarecredit.demo',
    responsiveness: 94,
    verification: 'verified',
    box: {
      minLoan: 7_500_000, maxLoan: 75_000_000, maxLtvPct: 85, minDscr: 1.2, minDebtYieldPct: 9.5,
      minOccupancyPct: 72, states: [], excludedStates: [],
      assetTypes: ['snf', 'alf', 'memory_care', 'behavioral_health', 'hospital', 'medical_office'],
      transactionTypes: ['acquisition', 'refinance', 'bridge', 'acquisition_refinance', 'recapitalization', 'construction'],
      minOperatorYears: 3, minFacilitiesOperated: 1, maxMedicaidPct: null, preferredDealSize: 22_000_000,
      typicalRateLow: 9.5, typicalRateHigh: 12.75, typicalTermMonths: 36,
      requiresAppraisal: true, requiresEnvironmental: true, taxReturnYears: 2,
      notes: 'We price for leverage. If a bank can do the deal at 70%, they will beat us; we are the answer between 75% and 85%.',
    },
  },
  {
    slug: 'community',
    company: 'Community Healthcare Capital',
    institutionName: 'Community Healthcare Capital',
    institutionType: 'credit_union',
    initials: 'CC',
    description:
      'A member-owned credit union serving healthcare operators in the upper Midwest. We focus on smaller transactions that larger institutions overlook, and we hold every loan on our own books.',
    contactName: 'Ellen Vasquez',
    contactEmail: 'commercial@communityhealthcap.demo',
    responsiveness: 65,
    verification: 'verified',
    box: {
      minLoan: 2_000_000, maxLoan: 12_000_000, maxLtvPct: 75, minDscr: 1.4, minDebtYieldPct: 12,
      minOccupancyPct: 84, states: ['IA', 'MN', 'WI', 'MO', 'NE', 'SD', 'ND'], excludedStates: [],
      assetTypes: ['snf', 'alf'], transactionTypes: ['acquisition', 'refinance', 'acquisition_refinance', 'capex'],
      minOperatorYears: 7, minFacilitiesOperated: 3, maxMedicaidPct: 62, preferredDealSize: 6_500_000,
      typicalRateLow: 6.4, typicalRateHigh: 7.4, typicalTermMonths: 84,
      requiresAppraisal: true, requiresEnvironmental: false, taxReturnYears: 3,
      notes: 'Conservative by design. We are rarely the highest proceeds but we are frequently the lowest cost, and we close what we quote.',
    },
  },
  {
    slug: 'summit',
    company: 'Summit Commercial Bank',
    institutionName: 'Summit Commercial Bank',
    institutionType: 'bank',
    initials: 'SC',
    description:
      'Southwest commercial bank with a healthcare vertical covering Texas and the surrounding states. Relationship lender — we expect operating accounts to move with the credit.',
    contactName: 'Grace Lindqvist',
    contactEmail: 'healthcare@summitcommercial.demo',
    responsiveness: 79,
    verification: 'verified',
    box: {
      minLoan: 4_000_000, maxLoan: 30_000_000, maxLtvPct: 78, minDscr: 1.35, minDebtYieldPct: 11.5,
      minOccupancyPct: 80, states: ['TX', 'AZ', 'NM', 'OK', 'CO', 'NV'], excludedStates: [],
      assetTypes: ['snf', 'alf', 'memory_care', 'medical_office'],
      transactionTypes: ['acquisition', 'refinance', 'acquisition_refinance', 'capex', 'working_capital'],
      minOperatorYears: 5, minFacilitiesOperated: 2, maxMedicaidPct: 68, preferredDealSize: 12_000_000,
      typicalRateLow: 7.1, typicalRateHigh: 8.4, typicalTermMonths: 60,
      requiresAppraisal: true, requiresEnvironmental: true, taxReturnYears: 3,
      notes: 'Strong appetite in Texas. We will look outside our stated footprint for an existing relationship.',
    },
  },
]

/** Builds a three-year operating history from a stabilised profile. */
function history(
  base: { revenue: number; ebitdaMargin: number; beds: number; occupancy: number },
  trend: { revenueGrowth: number[]; marginDelta: number[]; agency: number[]; occupancy: number[] },
  rent = 0,
): PeriodFixture[] {
  const years = [2023, 2024, 2025]
  return years.map((year, index) => {
    const revenue = Math.round(base.revenue * trend.revenueGrowth[index]!)
    const margin = base.ebitdaMargin + trend.marginDelta[index]!
    const ebitda = Math.round(revenue * margin)
    const labor = Math.round(revenue * 0.545)
    const agency = Math.round(labor * trend.agency[index]!)
    const utilities = Math.round(revenue * 0.031)
    const insurance = Math.round(revenue * 0.028)
    const taxes = Math.round(revenue * 0.019)
    const management = Math.round(revenue * 0.05)
    const capex = Math.round(base.beds * 385)
    const occupancy = trend.occupancy[index]!
    return {
      year,
      revenue,
      labor_expense: labor,
      agency_labor: agency,
      rent,
      utilities,
      insurance,
      taxes,
      management_fee: management,
      capex,
      total_operating_expense: revenue - ebitda,
      ebitda,
      net_income: Math.round(ebitda * 0.42),
      occupancy_pct: occupancy,
      average_census: Math.round((occupancy / 100) * base.beds),
    }
  })
}

export const DEALS: DealFixture[] = [
  {
    slug: 'lakeview',
    borrower: 'meridian',
    name: 'Lakeview Skilled Nursing Center',
    assetType: 'snf',
    transactionType: 'acquisition',
    city: 'Rockford', state: 'IL', zip: '61103', county: 'Winnebago',
    licensedBeds: 120, certifiedBeds: 120, operatingBeds: 120, currentCensus: 104,
    yearBuilt: 1988, lastRenovation: 2019, cmsStars: 4,
    operatingCompany: 'Lakeview Operations LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: 14_000_000, appraisedValue: 14_200_000, requestedFinancing: 10_500_000,
    existingDebt: null, sellerFinancing: 1_000_000, closingCosts: 420_000,
    capexRequirement: 500_000, workingCapital: 300_000,
    requestedRatePct: 7.25, requestedTermMonths: 60, requestedAmortMonths: 300, requestedIoMonths: 12,
    targetCloseInDays: 75,
    payer: { medicare: 16, medicaid: 58, managedCare: 12, privatePay: 12, other: 2 },
    periods: history(
      { revenue: 18_400_000, ebitdaMargin: 0.088, beds: 120, occupancy: 87 },
      { revenueGrowth: [0.918, 0.935, 1], marginDelta: [-0.018, -0.005, 0], agency: [0.136, 0.102, 0.061], occupancy: [86.1, 85.4, 87] },
    ),
    narrative:
      'Well-maintained four-star facility in a stable Rockford submarket. The seller is retiring after 22 years of ownership. Agency labor has been reduced materially over the trailing two years under an incoming administrator.',
    status: 'indications',
  },
  {
    slug: 'cedar-ridge',
    borrower: 'meridian',
    name: 'Cedar Ridge Care Center',
    assetType: 'snf',
    transactionType: 'refinance',
    city: 'Fort Wayne', state: 'IN', zip: '46825', county: 'Allen',
    licensedBeds: 96, certifiedBeds: 92, operatingBeds: 96, currentCensus: 85,
    yearBuilt: 1994, lastRenovation: 2021, cmsStars: 3,
    operatingCompany: 'Cedar Ridge Operations LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: null, appraisedValue: 11_800_000, requestedFinancing: 8_100_000,
    existingDebt: 7_450_000, sellerFinancing: null, closingCosts: 205_000,
    capexRequirement: 350_000, workingCapital: null,
    requestedRatePct: 6.95, requestedTermMonths: 84, requestedAmortMonths: 300, requestedIoMonths: 0,
    targetCloseInDays: 110,
    payer: { medicare: 19, medicaid: 51, managedCare: 15, privatePay: 13, other: 2 },
    periods: history(
      { revenue: 14_600_000, ebitdaMargin: 0.098, beds: 96, occupancy: 88.5 },
      { revenueGrowth: [0.93, 0.965, 1], marginDelta: [-0.012, -0.004, 0], agency: [0.088, 0.061, 0.038], occupancy: [85.4, 87.1, 88.5] },
    ),
    narrative:
      'Refinance of a maturing bank loan on a facility the sponsor has operated since 2018. Occupancy and margin have both improved each year since the 2021 renovation.',
    status: 'indications',
  },
  {
    slug: 'harborview',
    borrower: 'bluestem',
    name: 'Harborview Post-Acute',
    assetType: 'snf',
    transactionType: 'acquisition',
    city: 'Green Bay', state: 'WI', zip: '54303', county: 'Brown',
    licensedBeds: 148, certifiedBeds: 148, operatingBeds: 140, currentCensus: 118,
    yearBuilt: 1979, lastRenovation: 2014, cmsStars: 2,
    operatingCompany: 'Harborview Post-Acute LLC', managementCompany: 'Northstar Care Management', realEstateIncluded: true,
    purchasePrice: 15_600_000, appraisedValue: 14_900_000, requestedFinancing: 12_400_000,
    existingDebt: null, sellerFinancing: null, closingCosts: 468_000,
    capexRequirement: 1_800_000, workingCapital: 600_000,
    requestedRatePct: null, requestedTermMonths: null, requestedAmortMonths: null, requestedIoMonths: null,
    targetCloseInDays: 95,
    payer: { medicare: 11, medicaid: 74, managedCare: 8, privatePay: 5, other: 2 },
    periods: history(
      { revenue: 19_800_000, ebitdaMargin: 0.058, beds: 140, occupancy: 84.3 },
      { revenueGrowth: [0.955, 0.978, 1], marginDelta: [0.004, -0.002, 0], agency: [0.171, 0.158, 0.142], occupancy: [82.1, 83.4, 84.3] },
    ),
    narrative:
      'Value-add acquisition of an older two-star asset with a heavy Medicaid census and persistent agency reliance. The sponsor intends a $1.8M capital programme and a management change at closing.',
    taxReturnRevenueOverride: 18_950_000,
    status: 'ready',
  },
  {
    slug: 'prairie-meadows',
    borrower: 'bluestem',
    name: 'Prairie Meadows Health & Rehabilitation',
    assetType: 'snf',
    transactionType: 'acquisition_refinance',
    city: 'Cedar Rapids', state: 'IA', zip: '52402', county: 'Linn',
    licensedBeds: 82, certifiedBeds: 82, operatingBeds: 82, currentCensus: 73,
    yearBuilt: 2003, lastRenovation: 2020, cmsStars: 4,
    operatingCompany: 'Prairie Meadows Operations LLC', managementCompany: 'Northstar Care Management', realEstateIncluded: true,
    purchasePrice: 9_200_000, appraisedValue: 9_450_000, requestedFinancing: 6_600_000,
    existingDebt: 1_900_000, sellerFinancing: 450_000, closingCosts: 276_000,
    capexRequirement: 200_000, workingCapital: 250_000,
    requestedRatePct: 6.75, requestedTermMonths: 84, requestedAmortMonths: 300, requestedIoMonths: 6,
    targetCloseInDays: 120,
    payer: { medicare: 21, medicaid: 47, managedCare: 14, privatePay: 16, other: 2 },
    periods: history(
      { revenue: 12_300_000, ebitdaMargin: 0.107, beds: 82, occupancy: 89 },
      { revenueGrowth: [0.941, 0.972, 1], marginDelta: [-0.009, -0.003, 0], agency: [0.062, 0.041, 0.024], occupancy: [86.8, 88.2, 89] },
    ),
    narrative:
      'A newer, well-rated facility with the strongest payer mix in the portfolio. Combined acquisition of the real estate and refinance of the existing operating line.',
    status: 'ready',
  },
  {
    slug: 'stonebridge',
    borrower: 'bluestem',
    name: 'Stonebridge Nursing & Rehabilitation',
    assetType: 'snf',
    transactionType: 'acquisition',
    city: 'Dayton', state: 'OH', zip: '45419', county: 'Montgomery',
    licensedBeds: 160, certifiedBeds: 152, operatingBeds: 150, currentCensus: 111,
    yearBuilt: 1976, lastRenovation: 2011, cmsStars: 2,
    operatingCompany: 'Stonebridge Care LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: 13_800_000, appraisedValue: 12_100_000, requestedFinancing: 11_000_000,
    existingDebt: null, sellerFinancing: null, closingCosts: 414_000,
    capexRequirement: 2_400_000, workingCapital: 750_000,
    requestedRatePct: null, requestedTermMonths: null, requestedAmortMonths: null, requestedIoMonths: null,
    targetCloseInDays: 60,
    payer: { medicare: 13, medicaid: 69, managedCare: 10, privatePay: 6, other: 2 },
    periods: history(
      { revenue: 19_100_000, ebitdaMargin: 0.043, beds: 150, occupancy: 74 },
      { revenueGrowth: [1.062, 1.031, 1], marginDelta: [0.041, 0.019, 0], agency: [0.094, 0.148, 0.201], occupancy: [81.2, 77.6, 74] },
    ),
    narrative:
      'Turnaround acquisition. Census and margin have both deteriorated over two years as agency reliance has climbed. The sponsor believes the asset is mispriced; the appraisal came in $1.7M below the contract.',
    status: 'ready',
  },
  {
    slug: 'willow-creek',
    borrower: 'auburn',
    name: 'Willow Creek Care Community',
    assetType: 'snf',
    transactionType: 'bridge',
    city: 'Springfield', state: 'MO', zip: '65804', county: 'Greene',
    licensedBeds: 110, certifiedBeds: 104, operatingBeds: 110, currentCensus: 92,
    yearBuilt: 1998, lastRenovation: 2018, cmsStars: 3,
    operatingCompany: 'Willow Creek Operations LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: null, appraisedValue: 12_400_000, requestedFinancing: 9_300_000,
    existingDebt: 8_600_000, sellerFinancing: null, closingCosts: 279_000,
    capexRequirement: 400_000, workingCapital: 500_000,
    requestedRatePct: 9.5, requestedTermMonths: 24, requestedAmortMonths: 360, requestedIoMonths: 24,
    targetCloseInDays: 40,
    payer: { medicare: 18, medicaid: 55, managedCare: 13, privatePay: 12, other: 2 },
    periods: history(
      { revenue: 15_900_000, ebitdaMargin: 0.077, beds: 110, occupancy: 83.6 },
      { revenueGrowth: [0.947, 0.974, 1], marginDelta: [-0.021, -0.008, 0], agency: [0.121, 0.094, 0.072], occupancy: [79.8, 81.9, 83.6] },
    ),
    narrative:
      'Bridge financing to retire a maturing loan while the sponsor completes a census ramp and pursues agency permanent financing. A 40-day closing requirement rules out most bank processes.',
    status: 'indications',
  },
  {
    slug: 'northgate',
    borrower: 'meridian',
    name: 'Northgate Transitional Care',
    assetType: 'snf',
    transactionType: 'refinance',
    city: 'Rochester', state: 'MN', zip: '55904', county: 'Olmsted',
    licensedBeds: 124, certifiedBeds: 124, operatingBeds: 124, currentCensus: 114,
    yearBuilt: 2006, lastRenovation: 2022, cmsStars: 5,
    operatingCompany: 'Northgate Transitional Care LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: null, appraisedValue: 21_400_000, requestedFinancing: 13_900_000,
    existingDebt: 12_800_000, sellerFinancing: null, closingCosts: 348_000,
    capexRequirement: null, workingCapital: null,
    requestedRatePct: 6.6, requestedTermMonths: 120, requestedAmortMonths: 300, requestedIoMonths: 0,
    targetCloseInDays: 150,
    payer: { medicare: 28, medicaid: 34, managedCare: 17, privatePay: 19, other: 2 },
    periods: history(
      { revenue: 22_600_000, ebitdaMargin: 0.121, beds: 124, occupancy: 91.9 },
      { revenueGrowth: [0.929, 0.964, 1], marginDelta: [-0.014, -0.006, 0], agency: [0.041, 0.026, 0.014], occupancy: [89.1, 90.8, 91.9] },
    ),
    narrative:
      'The strongest asset in the sponsor portfolio: five-star, recently renovated, and adjacent to a major medical campus that drives an unusually favourable payer mix for the market.',
    status: 'indications',
  },
  {
    slug: 'rivermont',
    borrower: 'auburn',
    name: 'Rivermont Skilled Nursing',
    assetType: 'snf',
    transactionType: 'acquisition',
    city: 'San Antonio', state: 'TX', zip: '78229', county: 'Bexar',
    licensedBeds: 140, certifiedBeds: 132, operatingBeds: 130, currentCensus: 93,
    yearBuilt: 1985, lastRenovation: 2016, cmsStars: 3,
    operatingCompany: 'Rivermont SNF LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: 11_900_000, appraisedValue: 11_950_000, requestedFinancing: 9_500_000,
    existingDebt: null, sellerFinancing: 600_000, closingCosts: 357_000,
    capexRequirement: 900_000, workingCapital: 450_000,
    requestedRatePct: 7.6, requestedTermMonths: 60, requestedAmortMonths: 300, requestedIoMonths: 12,
    targetCloseInDays: 85,
    payer: { medicare: 15, medicaid: 63, managedCare: 12, privatePay: 8, other: 2 },
    periods: history(
      { revenue: 16_400_000, ebitdaMargin: 0.062, beds: 130, occupancy: 71.5 },
      { revenueGrowth: [0.986, 0.991, 1], marginDelta: [0.011, 0.004, 0], agency: [0.132, 0.118, 0.104], occupancy: [74.8, 72.9, 71.5] },
    ),
    narrative:
      'A well-located San Antonio asset trading below replacement cost, with occupancy that has drifted down for three consecutive years. The sponsor is a two-facility operator.',
    status: 'ready',
  },
  {
    slug: 'sunset-terrace',
    borrower: 'meridian',
    name: 'Sunset Terrace Health Center',
    assetType: 'snf',
    transactionType: 'capex',
    city: 'Mesa', state: 'AZ', zip: '85206', county: 'Maricopa',
    licensedBeds: 90, certifiedBeds: 90, operatingBeds: 90, currentCensus: 81,
    yearBuilt: 2001, lastRenovation: 2015, cmsStars: 4,
    operatingCompany: 'Sunset Terrace Operations LLC', managementCompany: null, realEstateIncluded: true,
    purchasePrice: null, appraisedValue: 13_100_000, requestedFinancing: 4_200_000,
    existingDebt: 5_900_000, sellerFinancing: null, closingCosts: 126_000,
    capexRequirement: 3_800_000, workingCapital: null,
    requestedRatePct: 7.4, requestedTermMonths: 84, requestedAmortMonths: 240, requestedIoMonths: 6,
    targetCloseInDays: 130,
    payer: { medicare: 24, medicaid: 41, managedCare: 19, privatePay: 14, other: 2 },
    periods: history(
      { revenue: 13_700_000, ebitdaMargin: 0.104, beds: 90, occupancy: 90 },
      { revenueGrowth: [0.951, 0.977, 1], marginDelta: [-0.007, -0.002, 0], agency: [0.054, 0.038, 0.029], occupancy: [88.4, 89.2, 90] },
    ),
    narrative:
      'Capital expenditure financing for a 24-bed memory care conversion and a full HVAC replacement at a stabilised four-star facility.',
    status: 'draft',
  },
  {
    slug: 'brookfield',
    borrower: 'bluestem',
    name: 'Brookfield Skilled Care',
    assetType: 'snf',
    transactionType: 'acquisition',
    city: 'Allentown', state: 'PA', zip: '18104', county: 'Lehigh',
    licensedBeds: 132, certifiedBeds: 132, operatingBeds: 132, currentCensus: 112,
    yearBuilt: 1991, lastRenovation: 2017, cmsStars: 3,
    operatingCompany: 'Brookfield Skilled Care LLC', managementCompany: 'Northstar Care Management', realEstateIncluded: true,
    purchasePrice: 17_400_000, appraisedValue: 17_600_000, requestedFinancing: 14_400_000,
    existingDebt: null, sellerFinancing: 900_000, closingCosts: 522_000,
    capexRequirement: 700_000, workingCapital: 550_000,
    requestedRatePct: 8.4, requestedTermMonths: 36, requestedAmortMonths: 300, requestedIoMonths: 24,
    targetCloseInDays: 70,
    payer: { medicare: 20, medicaid: 52, managedCare: 16, privatePay: 10, other: 2 },
    periods: history(
      { revenue: 21_300_000, ebitdaMargin: 0.073, beds: 132, occupancy: 84.8 },
      { revenueGrowth: [0.938, 0.969, 1], marginDelta: [-0.011, -0.004, 0], agency: [0.109, 0.087, 0.068], occupancy: [82.3, 83.6, 84.8] },
    ),
    narrative:
      'Acquisition at 82% loan-to-value, above conventional bank leverage. The sponsor is seeking maximum proceeds and is prepared to pay for them.',
    status: 'ready',
  },
]

export const ADMIN_USER = {
  email: 'admin@carecapital.demo',
  name: 'Alex Marchetti',
  title: 'Platform Operations',
  company: 'CareCapital Exchange',
}
