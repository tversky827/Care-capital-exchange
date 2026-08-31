import type { AssetType, TransactionType } from '@/types'
import type { BorrowerFixture, DealFixture, PeriodFixture } from './fixtures'

/**
 * The demonstration catalogue.
 *
 * A second, entirely fictional world of properties, operators and raises, used
 * to show the product to somebody. It is generated rather than hand-written:
 * fifty facilities typed out by hand would drift into inconsistency — a bed
 * count that does not divide into the revenue, an occupancy that contradicts
 * the census — and a demonstration falls apart the moment somebody checks the
 * arithmetic in front of you.
 *
 * Everything below derives from one seed value, so the same world is produced
 * every time. That matters more than it sounds: a presenter who has rehearsed
 * against one set of figures should not find different ones on the day.
 *
 * The generator produces plausible operating economics rather than flattering
 * ones. Two of the portfolios are genuinely difficult — thin coverage, heavy
 * agency labour — because a demonstration in which every deal looks good
 * teaches the wrong thing about the asset class and about the product, whose
 * entire purpose is to tell them apart.
 */

/** A tiny deterministic generator. Same seed, same world, every time. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    // xorshift32: short, deterministic, and good enough for fixtures.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

interface PortfolioSpec {
  slug: string
  name: string
  operator: string
  city: string
  state: string
  county: string
  zip: string
  /** Facilities in the portfolio. The bed counts are per facility. */
  facilities: { name: string; city: string; beds: number; built: number; stars: number | null }[]
  assetType: AssetType
  transactionType: TransactionType
  /** Revenue per occupied bed per year, which drives everything else. */
  revenuePerBed: number
  /** EBITDA margin at the latest year, as a fraction. */
  margin: number
  occupancy: number
  agencyShare: number
  payer: { medicare: number; medicaid: number; managedCare: number; privatePay: number; other: number }
  /** Price per bed. */
  pricePerBed: number
  leverage: number
  targetRaise: number
  minimum: number
  holdYears: number
  targetIrrPct: number
  narrative: string
  status: DealFixture['status']
}

const PORTFOLIOS: PortfolioSpec[] = [
  {
    slug: 'chicago-senior-care', name: 'Chicago Senior Care Portfolio',
    operator: 'midwest-senior', city: 'Chicago', state: 'IL', county: 'Cook', zip: '60632',
    facilities: [
      { name: 'Archer Heights Care Center', city: 'Chicago', beds: 142, built: 1988, stars: 3 },
      { name: 'Garfield Ridge Rehabilitation', city: 'Chicago', beds: 128, built: 1994, stars: 4 },
      { name: 'Brighton Park Skilled Nursing', city: 'Chicago', beds: 118, built: 1979, stars: 2 },
      { name: 'Clearing Post-Acute', city: 'Chicago', beds: 124, built: 2003, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 96_000, margin: 0.112, occupancy: 87, agencyShare: 0.041,
    payer: { medicare: 14, medicaid: 62, managedCare: 17, privatePay: 6, other: 1 },
    pricePerBed: 74_000, leverage: 0.66,
    targetRaise: 8_000_000, minimum: 10_000, holdYears: 5, targetIrrPct: 17.2,
    narrative: 'Four stabilised Cook County skilled nursing facilities acquired from a retiring owner-operator. The buyer operates eleven buildings in the state and intends to consolidate purchasing, reduce agency reliance and refinance at stabilisation.',
    status: 'ready',
  },
  {
    slug: 'sunshine-skilled', name: 'Sunshine Skilled Nursing Portfolio',
    operator: 'sunrise-healthcare', city: 'Tampa', state: 'FL', county: 'Hillsborough', zip: '33607',
    facilities: [
      { name: 'Bayshore Rehabilitation Center', city: 'Tampa', beds: 132, built: 1996, stars: 4 },
      { name: 'Ybor Park Skilled Nursing', city: 'Tampa', beds: 118, built: 1991, stars: 3 },
      { name: 'Carrollwood Care Center', city: 'Tampa', beds: 126, built: 2001, stars: 4 },
      { name: 'Brandon Post-Acute', city: 'Brandon', beds: 124, built: 1998, stars: 3 },
      { name: 'Riverview Nursing & Rehab', city: 'Riverview', beds: 118, built: 2006, stars: 4 },
      { name: 'Plant City Health Center', city: 'Plant City', beds: 116, built: 1985, stars: 2 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 101_000, margin: 0.124, occupancy: 89, agencyShare: 0.028,
    payer: { medicare: 17, medicaid: 55, managedCare: 21, privatePay: 6, other: 1 },
    pricePerBed: 82_000, leverage: 0.64,
    targetRaise: 12_500_000, minimum: 25_000, holdYears: 6, targetIrrPct: 15.8,
    narrative: 'Six-facility Tampa Bay portfolio with above-market Medicare mix and a stable management team retained through the transaction. The seller is a regional operator exiting Florida to concentrate on its home state.',
    status: 'ready',
  },
  {
    slug: 'lone-star-senior', name: 'Lone Star Senior Living',
    operator: 'lone-star-partners', city: 'San Antonio', state: 'TX', county: 'Bexar', zip: '78229',
    facilities: [
      { name: 'Medical Center Rehabilitation', city: 'San Antonio', beds: 138, built: 2004, stars: 4 },
      { name: 'Alamo Heights Care', city: 'San Antonio', beds: 124, built: 1997, stars: 3 },
      { name: 'Stone Oak Skilled Nursing', city: 'San Antonio', beds: 124, built: 2011, stars: 5 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 94_000, margin: 0.137, occupancy: 91, agencyShare: 0.019,
    payer: { medicare: 19, medicaid: 51, managedCare: 22, privatePay: 7, other: 1 },
    pricePerBed: 88_000, leverage: 0.62,
    targetRaise: 5_500_000, minimum: 10_000, holdYears: 4, targetIrrPct: 18.1,
    narrative: 'Three newer San Antonio buildings clustered around the South Texas Medical Center, with referral relationships to two acute systems and the strongest star ratings in the portfolio.',
    status: 'ready',
  },
  {
    slug: 'buckeye-post-acute', name: 'Buckeye Post-Acute Group',
    operator: 'evergreen-healthcare', city: 'Columbus', state: 'OH', county: 'Franklin', zip: '43215',
    facilities: [
      { name: 'Whitehall Care & Rehabilitation', city: 'Columbus', beds: 146, built: 1983, stars: 2 },
      { name: 'Reynoldsburg Skilled Nursing', city: 'Reynoldsburg', beds: 122, built: 1992, stars: 3 },
      { name: 'Gahanna Health Center', city: 'Gahanna', beds: 110, built: 1989, stars: 3 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 88_000, margin: 0.081, occupancy: 79, agencyShare: 0.094,
    payer: { medicare: 11, medicaid: 71, managedCare: 13, privatePay: 4, other: 1 },
    pricePerBed: 52_000, leverage: 0.71,
    targetRaise: 4_200_000, minimum: 10_000, holdYears: 5, targetIrrPct: 24.6,
    narrative: 'A genuine turnaround. Three central Ohio buildings running below break-even on agency labour that reached nine per cent of wages, with census twelve points under the market. The plan is a permanent-staffing programme first and a census recovery second; the return depends on both.',
    status: 'ready',
  },
  {
    slug: 'hoosier-care', name: 'Hoosier Care Communities',
    operator: 'heartland-senior', city: 'Indianapolis', state: 'IN', county: 'Marion', zip: '46220',
    facilities: [
      { name: 'Broad Ripple Nursing Center', city: 'Indianapolis', beds: 118, built: 1990, stars: 3 },
      { name: 'Carmel Skilled Nursing', city: 'Carmel', beds: 104, built: 2008, stars: 5 },
      { name: 'Greenwood Rehabilitation', city: 'Greenwood', beds: 112, built: 1999, stars: 4 },
      { name: 'Speedway Care Center', city: 'Speedway', beds: 96, built: 1986, stars: 3 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 92_000, margin: 0.129, occupancy: 88, agencyShare: 0.031,
    payer: { medicare: 16, medicaid: 58, managedCare: 19, privatePay: 6, other: 1 },
    pricePerBed: 71_000, leverage: 0.65,
    targetRaise: 6_400_000, minimum: 10_000, holdYears: 5, targetIrrPct: 16.9,
    narrative: 'Four Marion County and collar-county buildings under one licence holder, sold as part of a family estate settlement. Supplemental Medicaid payments in Indiana are a material part of the underwriting and are set out in full in the data room.',
    status: 'ready',
  },
  {
    slug: 'great-lakes-skilled', name: 'Great Lakes Skilled Nursing',
    operator: 'evergreen-healthcare', city: 'Grand Rapids', state: 'MI', county: 'Kent', zip: '49503',
    facilities: [
      { name: 'Heritage Hill Care Center', city: 'Grand Rapids', beds: 128, built: 1994, stars: 4 },
      { name: 'Wyoming Skilled Nursing', city: 'Wyoming', beds: 116, built: 1987, stars: 3 },
      { name: 'Kentwood Rehabilitation', city: 'Kentwood', beds: 108, built: 2002, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'refinance',
    revenuePerBed: 90_000, margin: 0.118, occupancy: 86, agencyShare: 0.038,
    payer: { medicare: 15, medicaid: 60, managedCare: 18, privatePay: 6, other: 1 },
    pricePerBed: 68_000, leverage: 0.68,
    targetRaise: 3_800_000, minimum: 10_000, holdYears: 5, targetIrrPct: 15.4,
    narrative: 'A recapitalisation rather than a purchase. The sponsor has operated these three buildings for nine years and is refinancing a maturing bridge facility while bringing in outside equity to fund a room-conversion programme.',
    status: 'ready',
  },
  {
    slug: 'desert-post-acute', name: 'Desert Post-Acute Partners',
    operator: 'sunrise-healthcare', city: 'Phoenix', state: 'AZ', county: 'Maricopa', zip: '85016',
    facilities: [
      { name: 'Camelback Rehabilitation', city: 'Phoenix', beds: 134, built: 2007, stars: 4 },
      { name: 'Mesa Skilled Nursing', city: 'Mesa', beds: 126, built: 2000, stars: 4 },
      { name: 'Glendale Care Center', city: 'Glendale', beds: 118, built: 1995, stars: 3 },
      { name: 'Chandler Post-Acute', city: 'Chandler', beds: 122, built: 2012, stars: 5 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 105_000, margin: 0.142, occupancy: 90, agencyShare: 0.022,
    payer: { medicare: 21, medicaid: 46, managedCare: 25, privatePay: 7, other: 1 },
    pricePerBed: 96_000, leverage: 0.61,
    targetRaise: 9_600_000, minimum: 25_000, holdYears: 5, targetIrrPct: 16.4,
    narrative: 'Four Maricopa County buildings with the strongest payer mix in the catalogue and a managed-care share that has grown every year for four years. Newer construction; capital expenditure is modelled at replacement level rather than catch-up.',
    status: 'ready',
  },
  {
    slug: 'peach-state-care', name: 'Peach State Care Group',
    operator: 'southern-cross', city: 'Atlanta', state: 'GA', county: 'Fulton', zip: '30318',
    facilities: [
      { name: 'West Midtown Nursing Center', city: 'Atlanta', beds: 124, built: 1991, stars: 3 },
      { name: 'Decatur Skilled Nursing', city: 'Decatur', beds: 118, built: 1996, stars: 3 },
      { name: 'Marietta Rehabilitation', city: 'Marietta', beds: 132, built: 2005, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 89_000, margin: 0.109, occupancy: 85, agencyShare: 0.047,
    payer: { medicare: 14, medicaid: 63, managedCare: 17, privatePay: 5, other: 1 },
    pricePerBed: 66_000, leverage: 0.67,
    targetRaise: 5_100_000, minimum: 10_000, holdYears: 5, targetIrrPct: 18.7,
    narrative: 'Three metro Atlanta buildings from a seller consolidating out of Georgia. Census recovered through the last two years but remains below the 2019 level, and the underwriting does not assume it returns there.',
    status: 'ready',
  },
  {
    slug: 'tar-heel-senior', name: 'Tar Heel Senior Care',
    operator: 'southern-cross', city: 'Charlotte', state: 'NC', county: 'Mecklenburg', zip: '28209',
    facilities: [
      { name: 'Dilworth Care Center', city: 'Charlotte', beds: 112, built: 1998, stars: 4 },
      { name: 'Matthews Skilled Nursing', city: 'Matthews', beds: 106, built: 2009, stars: 4 },
      { name: 'Concord Rehabilitation', city: 'Concord', beds: 120, built: 2003, stars: 3 },
      { name: 'Gastonia Health Center', city: 'Gastonia', beds: 98, built: 1984, stars: 2 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 93_000, margin: 0.126, occupancy: 88, agencyShare: 0.029,
    payer: { medicare: 17, medicaid: 56, managedCare: 20, privatePay: 6, other: 1 },
    pricePerBed: 78_000, leverage: 0.64,
    targetRaise: 6_900_000, minimum: 10_000, holdYears: 5, targetIrrPct: 16.1,
    narrative: 'Four buildings across the Charlotte metropolitan area, three of them performing and one requiring a licence remediation that is under way and disclosed in full. Certificate-of-need protection limits new supply in the market.',
    status: 'ready',
  },
  {
    slug: 'volunteer-post-acute', name: 'Volunteer Post-Acute',
    operator: 'heartland-senior', city: 'Nashville', state: 'TN', county: 'Davidson', zip: '37209',
    facilities: [
      { name: 'The Nations Rehabilitation', city: 'Nashville', beds: 128, built: 2010, stars: 5 },
      { name: 'Madison Skilled Nursing', city: 'Madison', beds: 114, built: 1993, stars: 3 },
      { name: 'Murfreesboro Care Center', city: 'Murfreesboro', beds: 122, built: 2001, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 97_000, margin: 0.134, occupancy: 90, agencyShare: 0.024,
    payer: { medicare: 19, medicaid: 52, managedCare: 22, privatePay: 6, other: 1 },
    pricePerBed: 86_000, leverage: 0.63,
    targetRaise: 5_800_000, minimum: 10_000, holdYears: 4, targetIrrPct: 17.6,
    narrative: 'Three Middle Tennessee buildings serving a metropolitan area adding population faster than it is adding skilled nursing beds. The sponsor operates six facilities in the state and has closed four prior acquisitions.',
    status: 'ready',
  },
  {
    slug: 'golden-state-skilled', name: 'Golden State Skilled Nursing',
    operator: 'pacific-crest', city: 'Sacramento', state: 'CA', county: 'Sacramento', zip: '95816',
    facilities: [
      { name: 'Midtown Sacramento Care', city: 'Sacramento', beds: 118, built: 1989, stars: 3 },
      { name: 'Roseville Rehabilitation', city: 'Roseville', beds: 124, built: 2004, stars: 4 },
      { name: 'Elk Grove Skilled Nursing', city: 'Elk Grove', beds: 110, built: 2011, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 128_000, margin: 0.115, occupancy: 89, agencyShare: 0.052,
    payer: { medicare: 15, medicaid: 59, managedCare: 20, privatePay: 5, other: 1 },
    pricePerBed: 112_000, leverage: 0.60,
    targetRaise: 11_200_000, minimum: 25_000, holdYears: 6, targetIrrPct: 14.8,
    narrative: 'Three Sacramento-area buildings. California revenue per bed is the highest in the catalogue and so is the cost base; the underwriting reflects state minimum-staffing requirements and the wage schedule that goes with them.',
    status: 'ready',
  },
  {
    slug: 'keystone-care', name: 'Keystone Care Communities',
    operator: 'liberty-senior', city: 'Pittsburgh', state: 'PA', county: 'Allegheny', zip: '15206',
    facilities: [
      { name: 'East Liberty Nursing Center', city: 'Pittsburgh', beds: 136, built: 1981, stars: 2 },
      { name: 'Mount Lebanon Care', city: 'Pittsburgh', beds: 118, built: 1995, stars: 4 },
      { name: 'Monroeville Rehabilitation', city: 'Monroeville', beds: 124, built: 1999, stars: 3 },
      { name: 'Bethel Park Skilled Nursing', city: 'Bethel Park', beds: 106, built: 2006, stars: 4 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 91_000, margin: 0.095, occupancy: 83, agencyShare: 0.068,
    payer: { medicare: 13, medicaid: 66, managedCare: 16, privatePay: 4, other: 1 },
    pricePerBed: 58_000, leverage: 0.69,
    targetRaise: 5_600_000, minimum: 10_000, holdYears: 6, targetIrrPct: 21.3,
    narrative: 'Four Allegheny County buildings with an ageing physical plant and the second-heaviest agency labour in the catalogue. Two require substantial capital expenditure in the first eighteen months, which is funded from the raise rather than from operations.',
    status: 'ready',
  },
  {
    slug: 'bay-state-post-acute', name: 'Bay State Post-Acute',
    operator: 'liberty-senior', city: 'Worcester', state: 'MA', county: 'Worcester', zip: '01605',
    facilities: [
      { name: 'Shrewsbury Street Rehabilitation', city: 'Worcester', beds: 108, built: 1997, stars: 4 },
      { name: 'Auburn Skilled Nursing', city: 'Auburn', beds: 96, built: 2005, stars: 4 },
      { name: 'Shrewsbury Care Center', city: 'Shrewsbury', beds: 104, built: 1992, stars: 3 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 118_000, margin: 0.121, occupancy: 91, agencyShare: 0.044,
    payer: { medicare: 18, medicaid: 57, managedCare: 20, privatePay: 4, other: 1 },
    pricePerBed: 104_000, leverage: 0.62,
    targetRaise: 7_400_000, minimum: 25_000, holdYears: 5, targetIrrPct: 15.2,
    narrative: 'Three central Massachusetts buildings in a certificate-of-need state with effectively no new construction. Occupancy is the highest in the catalogue; the return depends on rate growth and cost control rather than on filling beds.',
    status: 'ready',
  },
  {
    slug: 'gateway-senior', name: 'Gateway Senior Living',
    operator: 'midwest-senior', city: 'St. Louis', state: 'MO', county: 'St. Louis', zip: '63110',
    facilities: [
      { name: 'The Hill Care Center', city: 'St. Louis', beds: 114, built: 1986, stars: 3 },
      { name: 'Kirkwood Rehabilitation', city: 'Kirkwood', beds: 108, built: 2000, stars: 4 },
      { name: 'Florissant Skilled Nursing', city: 'Florissant', beds: 126, built: 1990, stars: 3 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 87_000, margin: 0.113, occupancy: 86, agencyShare: 0.036,
    payer: { medicare: 15, medicaid: 61, managedCare: 18, privatePay: 5, other: 1 },
    pricePerBed: 64_000, leverage: 0.66,
    targetRaise: 4_600_000, minimum: 10_000, holdYears: 5, targetIrrPct: 17.9,
    narrative: 'Three St. Louis County buildings acquired alongside the operating companies. The sponsor already runs four facilities within thirty miles, so the regional management overhead is absorbed rather than added.',
    status: 'ready',
  },
  {
    slug: 'sooner-care-group', name: 'Sooner Care Group',
    operator: 'lone-star-partners', city: 'Oklahoma City', state: 'OK', county: 'Oklahoma', zip: '73112',
    facilities: [
      { name: 'Mesta Park Nursing Center', city: 'Oklahoma City', beds: 102, built: 1988, stars: 3 },
      { name: 'Edmond Skilled Nursing', city: 'Edmond', beds: 112, built: 2002, stars: 4 },
      { name: 'Norman Rehabilitation', city: 'Norman', beds: 98, built: 1994, stars: 3 },
    ],
    assetType: 'snf', transactionType: 'acquisition',
    revenuePerBed: 82_000, margin: 0.104, occupancy: 84, agencyShare: 0.042,
    payer: { medicare: 14, medicaid: 64, managedCare: 16, privatePay: 5, other: 1 },
    pricePerBed: 54_000, leverage: 0.68,
    targetRaise: 3_200_000, minimum: 10_000, holdYears: 5, targetIrrPct: 19.4,
    narrative: 'Three Oklahoma buildings at the smallest scale in the catalogue, which is the point of including it: the fixed cost of regional management falls on fewer beds, and the underwriting shows what that does to the margin.',
    status: 'ready',
  },
]

/**
 * The operators behind the demonstration catalogue.
 *
 * All invented. Each has a stated philosophy and a track record, because the
 * question an investor asks second — after "what is the return" — is "who is
 * running it", and a demonstration in which every sponsor is interchangeable
 * cannot show the product answering it.
 */
export const DEMO_OPERATORS: (BorrowerFixture & { philosophy: string })[] = [
  {
    slug: 'midwest-senior', company: 'Midwest Senior Healthcare Partners',
    city: 'Chicago', state: 'IL',
    philosophy: 'Buys underperforming buildings in markets where it already operates, and fixes staffing before it touches anything else.',
    users: [{ email: 'partners@midwestsenior.demo', name: 'Ruth Kowalczyk', title: 'Managing Partner', role: 'owner' }],
    sponsor: {
      legalEntity: 'Midwest Senior Healthcare Partners LLC',
      yearsInHealthcare: 22, yearsOperatingAssetType: 18, facilitiesOperated: 11,
      bedsOperated: 1_340, statesOperated: ['IL', 'MO'], historicalAcquisitions: 9,
      previousExits: 4, priorDefaults: false, netWorth: 42_000_000, liquidity: 11_000_000,
      managementTeam: 'Founded by two former regional operators; a nine-person central office covering finance, clinical and human resources.',
      relevantExperience: 'Nine acquisitions in Illinois and Missouri since 2011, four of them turnarounds sold at stabilisation.',
    },
  },
  {
    slug: 'sunrise-healthcare', company: 'Sunrise Healthcare Capital',
    city: 'Tampa', state: 'FL',
    philosophy: 'Concentrates on newer physical plant with a high managed-care share, and will pay up for a building it does not have to renovate.',
    users: [{ email: 'capital@sunrisehealthcare.demo', name: 'Elena Sandoval', title: 'Principal', role: 'owner' }],
    sponsor: {
      legalEntity: 'Sunrise Healthcare Capital LLC',
      yearsInHealthcare: 17, yearsOperatingAssetType: 14, facilitiesOperated: 14,
      bedsOperated: 1_720, statesOperated: ['FL', 'AZ'], historicalAcquisitions: 11,
      previousExits: 5, priorDefaults: false, netWorth: 58_000_000, liquidity: 16_000_000,
      managementTeam: 'A ten-person office in Tampa with a dedicated managed-care contracting function.',
      relevantExperience: 'Eleven acquisitions across Florida and Arizona, concentrated in post-2000 physical plant.',
    },
  },
  {
    slug: 'lone-star-partners', company: 'Lone Star Senior Living Partners',
    city: 'San Antonio', state: 'TX',
    philosophy: 'Clusters facilities around acute-care referral sources and runs them from a single regional office.',
    users: [{ email: 'deals@lonestarsenior.demo', name: 'Marcus Villarreal', title: 'General Partner', role: 'owner' }],
    sponsor: {
      legalEntity: 'Lone Star Senior Living Partners LP',
      yearsInHealthcare: 14, yearsOperatingAssetType: 14, facilitiesOperated: 8,
      bedsOperated: 940, statesOperated: ['TX', 'OK'], historicalAcquisitions: 6,
      previousExits: 2, priorDefaults: false, netWorth: 29_000_000, liquidity: 8_500_000,
      managementTeam: 'An owner-operator with a six-person regional office in San Antonio.',
      relevantExperience: 'Six acquisitions clustered around acute referral sources in Texas and Oklahoma.',
    },
  },
  {
    slug: 'evergreen-healthcare', company: 'Evergreen Healthcare Investments',
    city: 'Grand Rapids', state: 'MI',
    philosophy: 'Takes on turnarounds other buyers will not, and underwrites them on permanent staffing rather than on census recovery.',
    users: [{ email: 'invest@evergreenhealthcare.demo', name: 'Dermot Whelan', title: 'Managing Director', role: 'owner' }],
    sponsor: {
      legalEntity: 'Evergreen Healthcare Investments LLC',
      yearsInHealthcare: 19, yearsOperatingAssetType: 16, facilitiesOperated: 9,
      bedsOperated: 1_050, statesOperated: ['MI', 'OH'], historicalAcquisitions: 8,
      previousExits: 3, priorDefaults: false, netWorth: 34_000_000, liquidity: 9_200_000,
      managementTeam: 'Turnaround specialists; the clinical lead was a state survey supervisor for eleven years.',
      relevantExperience: 'Eight acquisitions, six of which were operating below break-even at purchase.',
    },
  },
  {
    slug: 'heartland-senior', company: 'Heartland Senior Care Partners',
    city: 'Indianapolis', state: 'IN',
    philosophy: 'Buys from families and estates, retains the existing management team, and holds longer than the market average.',
    users: [{ email: 'office@heartlandsenior.demo', name: 'Constance Ijeoma', title: 'President', role: 'owner' }],
    sponsor: {
      legalEntity: 'Heartland Senior Care Partners LLC',
      yearsInHealthcare: 25, yearsOperatingAssetType: 21, facilitiesOperated: 12,
      bedsOperated: 1_280, statesOperated: ['IN', 'TN'], historicalAcquisitions: 7,
      previousExits: 2, priorDefaults: false, netWorth: 38_000_000, liquidity: 10_400_000,
      managementTeam: 'A second-generation family operator; retains the incumbent administrator at every building it buys.',
      relevantExperience: 'Seven acquisitions from families and estates, with an average hold of nine years.',
    },
  },
  {
    slug: 'southern-cross', company: 'Southern Cross Care Group',
    city: 'Atlanta', state: 'GA',
    philosophy: 'Operates in certificate-of-need states where new supply is constrained, and accepts lower going-in yields for it.',
    users: [{ email: 'group@southerncrosscare.demo', name: 'Tobias Ferreira', title: 'Managing Partner', role: 'owner' }],
    sponsor: {
      legalEntity: 'Southern Cross Care Group LLC',
      yearsInHealthcare: 16, yearsOperatingAssetType: 13, facilitiesOperated: 10,
      bedsOperated: 1_160, statesOperated: ['GA', 'NC', 'SC'], historicalAcquisitions: 8,
      previousExits: 3, priorDefaults: false, netWorth: 31_000_000, liquidity: 7_800_000,
      managementTeam: 'An eight-person office in Atlanta with in-house certificate-of-need counsel.',
      relevantExperience: 'Eight acquisitions in certificate-of-need states, none in an unconstrained market.',
    },
  },
  {
    slug: 'pacific-crest', company: 'Pacific Crest Healthcare Partners',
    city: 'Sacramento', state: 'CA',
    philosophy: 'Specialises in high-regulation, high-reimbursement states and staffs above the statutory minimum by design.',
    users: [{ email: 'crest@pacificcresthealth.demo', name: 'Ingrid Halvorsen', title: 'Principal', role: 'owner' }],
    sponsor: {
      legalEntity: 'Pacific Crest Healthcare Partners LLC',
      yearsInHealthcare: 13, yearsOperatingAssetType: 11, facilitiesOperated: 7,
      bedsOperated: 820, statesOperated: ['CA'], historicalAcquisitions: 5,
      previousExits: 1, priorDefaults: false, netWorth: 44_000_000, liquidity: 13_500_000,
      managementTeam: 'A California-only operator whose compliance function is larger than its finance function.',
      relevantExperience: 'Five acquisitions in California, all staffed above the statutory minimum since purchase.',
    },
  },
  {
    slug: 'liberty-senior', company: 'Liberty Senior Care Partners',
    city: 'Pittsburgh', state: 'PA',
    philosophy: 'Acquires older physical plant at a discount and funds the capital programme from the raise rather than from cash flow.',
    users: [{ email: 'liberty@libertysenior.demo', name: 'Aurelio Bastianelli', title: 'Managing Partner', role: 'owner' }],
    sponsor: {
      legalEntity: 'Liberty Senior Care Partners LLC',
      yearsInHealthcare: 20, yearsOperatingAssetType: 15, facilitiesOperated: 13,
      bedsOperated: 1_480, statesOperated: ['PA', 'MA', 'NY'], historicalAcquisitions: 10,
      previousExits: 4, priorDefaults: false, netWorth: 36_000_000, liquidity: 9_600_000,
      managementTeam: 'Runs its own construction management arm for the capital programmes it underwrites.',
      relevantExperience: 'Ten acquisitions of older physical plant, each with a funded first-eighteen-month capital plan.',
    },
  },
]

/** Builds three years of operating history from a portfolio's stated economics. */
function periodsFor(spec: PortfolioSpec, random: () => number): PeriodFixture[] {
  const beds = spec.facilities.reduce((total, facility) => total + facility.beds, 0)
  const thisYear = new Date().getUTCFullYear()

  return [2, 1, 0].map((back, index) => {
    const year = thisYear - 1 - back
    // Each year walks toward the stated present: occupancy recovers, margin
    // improves, agency comes down. A history that is flat teaches nothing
    // about what the sponsor is proposing to change.
    const drift = (index - 2) * 0.5 + (random() - 0.5) * 0.4
    const occupancy = Math.round((spec.occupancy + drift - (2 - index) * 1.6) * 10) / 10
    const census = Math.round(beds * (occupancy / 100))
    const revenue = Math.round(census * spec.revenuePerBed * (0.96 + index * 0.02))
    const margin = spec.margin - (2 - index) * 0.014
    const ebitda = Math.round(revenue * margin)
    const opex = revenue - ebitda

    const labor = Math.round(opex * 0.62)
    const agency = Math.round(labor * (spec.agencyShare + (2 - index) * 0.012))
    const utilities = Math.round(revenue * 0.026)
    const insurance = Math.round(revenue * 0.021)
    const taxes = Math.round(revenue * 0.017)
    const management = Math.round(revenue * 0.05)

    return {
      year,
      revenue,
      labor_expense: labor,
      agency_labor: agency,
      rent: 0,
      utilities,
      insurance,
      taxes,
      management_fee: management,
      capex: Math.round(beds * 420),
      total_operating_expense: opex,
      ebitda,
      net_income: Math.round(ebitda * 0.42),
      occupancy_pct: occupancy,
      average_census: census,
    }
  })
}

/** The demonstration catalogue, as deal fixtures the ordinary seed can consume. */
export function demoDealFixtures(): (DealFixture & { spec: PortfolioSpec })[] {
  const random = rng(0xca9eca17)

  return PORTFOLIOS.map((spec) => {
    const beds = spec.facilities.reduce((total, facility) => total + facility.beds, 0)
    const periods = periodsFor(spec, random)
    const price = Math.round((beds * spec.pricePerBed) / 10_000) * 10_000
    const financing = Math.round((price * spec.leverage) / 10_000) * 10_000
    const primary = spec.facilities[0]!

    return {
      spec,
      slug: `demo-${spec.slug}`,
      borrower: spec.operator,
      // The portfolio's name, not the building's: a multi-facility raise is
      // what is being sold, and naming it after one building would misdescribe
      // it on every screen that shows a name.
      name: spec.name,
      assetType: spec.assetType,
      transactionType: spec.transactionType,
      city: spec.city,
      state: spec.state,
      zip: spec.zip,
      county: spec.county,
      licensedBeds: beds,
      certifiedBeds: beds,
      operatingBeds: beds,
      currentCensus: Math.round(beds * (spec.occupancy / 100)),
      yearBuilt: primary.built,
      lastRenovation: primary.built + 18,
      cmsStars: primary.stars,
      operatingCompany: `${spec.name} OpCo LLC`,
      managementCompany: DEMO_OPERATORS.find((o) => o.slug === spec.operator)?.company ?? null,
      realEstateIncluded: true,
      purchasePrice: spec.transactionType === 'refinance' ? null : price,
      appraisedValue: Math.round((price * 1.04) / 10_000) * 10_000,
      requestedFinancing: financing,
      existingDebt: spec.transactionType === 'refinance' ? Math.round(financing * 0.86) : null,
      sellerFinancing: null,
      closingCosts: Math.round((price * 0.022) / 1_000) * 1_000,
      capexRequirement: Math.round((beds * 2_400) / 1_000) * 1_000,
      workingCapital: Math.round((periods[2]!.revenue * 0.04) / 1_000) * 1_000,
      requestedRatePct: 6.75 + Math.round(random() * 10) / 10,
      requestedTermMonths: 60,
      requestedAmortMonths: 300,
      requestedIoMonths: 12,
      targetCloseInDays: 60 + Math.round(random() * 60),
      payer: spec.payer,
      periods,
      narrative: spec.narrative,
      status: spec.status,
    }
  })
}

export type DemoPortfolio = PortfolioSpec
export { PORTFOLIOS as DEMO_PORTFOLIOS }
