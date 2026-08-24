import 'server-only'
import { db } from '@/db'
import type { DealStatus } from '@/types'

/**
 * Analytics.
 *
 * All three audiences read from the same event history, scoped differently:
 * borrowers see their own deals, lenders see their own pipeline, and admins see
 * the marketplace. No lender-identifying performance data is ever exposed to a
 * borrower or to a competing lender.
 */

const FUNDED_STATUSES: DealStatus[] = ['funded']
const ACTIVE_STATUSES: DealStatus[] = [
  'intake', 'document_collection', 'processing', 'underwriting', 'needs_attention',
  'ready_for_distribution', 'distributed', 'indications_received', 'under_loi', 'diligence', 'closing',
]

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export interface BorrowerAnalytics {
  activeDeals: number
  capitalRequested: number
  capitalFunded: number
  totalMatches: number
  averageMatchesPerDeal: number
  indicationsReceived: number
  dealsClosed: number
  medianDaysToFirstIndication: number | null
  lenderResponseRatePct: number | null
  averageIndicationRatePct: number | null
}

export async function borrowerAnalytics(companyId: string): Promise<BorrowerAnalytics> {
  const store = await db()
  const deals = await store.select('deals', { where: { company_id: companyId } })
  const dealIds = deals.map((d) => d.id)
  if (!dealIds.length) {
    return {
      activeDeals: 0, capitalRequested: 0, capitalFunded: 0, totalMatches: 0,
      averageMatchesPerDeal: 0, indicationsReceived: 0, dealsClosed: 0,
      medianDaysToFirstIndication: null, lenderResponseRatePct: null, averageIndicationRatePct: null,
    }
  }

  const [terms, matches, indications, distributions] = await Promise.all([
    store.select('transaction_terms', { where: { deal_id: { in: dealIds } } }),
    store.select('matches', { where: { deal_id: { in: dealIds } } }),
    store.select('indications', { where: { deal_id: { in: dealIds } } }),
    store.select('deal_distributions', { where: { deal_id: { in: dealIds } } }),
  ])

  const inBoxMatches = matches.filter((m) => !m.hard_fail)
  const fundedIds = new Set(deals.filter((d) => FUNDED_STATUSES.includes(d.status)).map((d) => d.id))

  const timeToIndication: number[] = []
  for (const deal of deals) {
    if (!deal.distributed_at) continue
    const first = indications
      .filter((i) => i.deal_id === deal.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (first) timeToIndication.push(hoursBetween(deal.distributed_at, first.created_at) / 24)
  }

  const engaged = distributions.filter((d) => d.status === 'engaged' || d.status === 'passed' || d.view_count > 0)

  return {
    activeDeals: deals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length,
    capitalRequested: terms.reduce((sum, t) => sum + (t.requested_financing ?? 0), 0),
    capitalFunded: terms
      .filter((t) => fundedIds.has(t.deal_id))
      .reduce((sum, t) => sum + (t.requested_financing ?? 0), 0),
    totalMatches: inBoxMatches.length,
    averageMatchesPerDeal: deals.length ? Math.round((inBoxMatches.length / deals.length) * 10) / 10 : 0,
    indicationsReceived: indications.length,
    dealsClosed: fundedIds.size,
    medianDaysToFirstIndication: median(timeToIndication) === null ? null : Math.round(median(timeToIndication)! * 10) / 10,
    lenderResponseRatePct: distributions.length
      ? Math.round((engaged.length / distributions.length) * 1000) / 10
      : null,
    averageIndicationRatePct: indications.length
      ? Math.round((indications.reduce((sum, i) => sum + i.all_in_rate_pct, 0) / indications.length) * 100) / 100
      : null,
  }
}

export interface LenderAnalytics {
  dealsReceived: number
  dealsViewed: number
  dealsPursued: number
  indicationsSubmitted: number
  indicationsSelected: number
  viewRatePct: number | null
  conversionRatePct: number | null
  averageLoanAmount: number | null
  averageLtvPct: number | null
  averageDscr: number | null
  averageRatePct: number | null
}

export async function lenderAnalytics(lenderId: string): Promise<LenderAnalytics> {
  const store = await db()
  const [distributions, indications] = await Promise.all([
    store.select('deal_distributions', { where: { lender_id: lenderId } }),
    store.select('indications', { where: { lender_id: lenderId } }),
  ])

  const viewed = distributions.filter((d) => d.view_count > 0)
  const pursued = distributions.filter(
    (d) => !['new_match', 'reviewing', 'passed'].includes(d.pipeline_stage),
  )
  const selected = indications.filter((i) => i.status === 'selected')

  const dealIds = [...new Set(distributions.map((d) => d.deal_id))]
  const matches = dealIds.length
    ? await store.select('matches', { where: { deal_id: { in: dealIds }, lender_id: lenderId } })
    : []
  const snapshots = dealIds.length
    ? await store.select('transaction_terms', { where: { deal_id: { in: dealIds } } })
    : []

  const ltvs = matches
    .flatMap((m) => m.factors.filter((f) => f.key === 'ltv'))
    .map((f) => Number(f.detail.match(/([\d.]+)%/)?.[1]))
    .filter((v) => Number.isFinite(v))

  return {
    dealsReceived: distributions.length,
    dealsViewed: viewed.length,
    dealsPursued: pursued.length,
    indicationsSubmitted: indications.length,
    indicationsSelected: selected.length,
    viewRatePct: distributions.length ? Math.round((viewed.length / distributions.length) * 1000) / 10 : null,
    conversionRatePct: viewed.length ? Math.round((indications.length / viewed.length) * 1000) / 10 : null,
    averageLoanAmount: indications.length
      ? Math.round(indications.reduce((sum, i) => sum + i.loan_amount, 0) / indications.length)
      : snapshots.length
        ? Math.round(snapshots.reduce((sum, t) => sum + (t.requested_financing ?? 0), 0) / snapshots.length)
        : null,
    averageLtvPct: ltvs.length ? Math.round((ltvs.reduce((a, b) => a + b, 0) / ltvs.length) * 10) / 10 : null,
    averageDscr: null,
    averageRatePct: indications.length
      ? Math.round((indications.reduce((sum, i) => sum + i.all_in_rate_pct, 0) / indications.length) * 100) / 100
      : null,
  }
}

export interface PlatformAnalytics {
  totalUsers: number
  borrowerCompanies: number
  lenderCompanies: number
  activeDeals: number
  totalRequestedCapital: number
  totalFundedCapital: number
  totalIndications: number
  averageDealSize: number | null
  averageMatchScore: number | null
  medianDaysToIndication: number | null
  lenderParticipationRatePct: number | null
  dealConversionRatePct: number | null
}

export async function platformAnalytics(): Promise<PlatformAnalytics> {
  const store = await db()
  const [users, companies, deals, terms, indications, matches, distributions] = await Promise.all([
    store.select('users', {}),
    store.select('companies', {}),
    store.select('deals', {}),
    store.select('transaction_terms', {}),
    store.select('indications', {}),
    store.select('matches', {}),
    store.select('deal_distributions', {}),
  ])

  const fundedIds = new Set(deals.filter((d) => FUNDED_STATUSES.includes(d.status)).map((d) => d.id))
  const requested = terms.reduce((sum, t) => sum + (t.requested_financing ?? 0), 0)
  const inBox = matches.filter((m) => !m.hard_fail)

  const timeToIndication: number[] = []
  for (const deal of deals) {
    if (!deal.distributed_at) continue
    const first = indications
      .filter((i) => i.deal_id === deal.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (first) timeToIndication.push(hoursBetween(deal.distributed_at, first.created_at) / 24)
  }

  const lenderCompanyIds = new Set(companies.filter((c) => c.type === 'lender').map((c) => c.id))
  const participatingLenders = new Set(distributions.filter((d) => d.view_count > 0).map((d) => d.lender_id))
  const distributedDeals = deals.filter((d) => d.distributed_at)

  return {
    totalUsers: users.length,
    borrowerCompanies: companies.filter((c) => c.type === 'borrower').length,
    lenderCompanies: lenderCompanyIds.size,
    activeDeals: deals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length,
    totalRequestedCapital: requested,
    totalFundedCapital: terms
      .filter((t) => fundedIds.has(t.deal_id))
      .reduce((sum, t) => sum + (t.requested_financing ?? 0), 0),
    totalIndications: indications.length,
    averageDealSize: terms.length ? Math.round(requested / terms.length) : null,
    averageMatchScore: inBox.length
      ? Math.round(inBox.reduce((sum, m) => sum + m.score, 0) / inBox.length)
      : null,
    medianDaysToIndication: median(timeToIndication) === null ? null : Math.round(median(timeToIndication)! * 10) / 10,
    lenderParticipationRatePct: lenderCompanyIds.size
      ? Math.round((participatingLenders.size / lenderCompanyIds.size) * 1000) / 10
      : null,
    dealConversionRatePct: distributedDeals.length
      ? Math.round((distributedDeals.filter((d) => indications.some((i) => i.deal_id === d.id)).length / distributedDeals.length) * 1000) / 10
      : null,
  }
}

/**
 * Anonymous benchmarks.
 *
 * Aggregates only, with a minimum cohort size, so no single transaction or
 * lender can be inferred from a published figure.
 */
export const MIN_BENCHMARK_COHORT = 3

export interface Benchmark {
  dimension: string
  cohort: string
  sampleSize: number
  medianLtvPct: number | null
  medianDscr: number | null
  medianDebtYieldPct: number | null
  medianOccupancyPct: number | null
  medianRatePct: number | null
}

export async function benchmarks(by: 'state' | 'asset_type' | 'loan_size'): Promise<Benchmark[]> {
  const store = await db()
  const [deals, facilities, matches, indications, metrics] = await Promise.all([
    store.select('deals', {}),
    store.select('facilities', {}),
    store.select('matches', {}),
    store.select('indications', {}),
    store.select('facility_metrics', {}),
  ])

  const groups = new Map<string, { ltv: number[]; dscr: number[]; dy: number[]; occ: number[]; rate: number[] }>()
  for (const deal of deals) {
    const facility = facilities.find((f) => f.deal_id === deal.id)
    const terms = matches.find((m) => m.deal_id === deal.id)
    const cohort =
      by === 'state' ? facility?.state ?? 'Unknown'
      : by === 'asset_type' ? deal.asset_type
      : 'All sizes'
    const bucket = groups.get(cohort) ?? { ltv: [], dscr: [], dy: [], occ: [], rate: [] }

    for (const factor of terms?.factors ?? []) {
      const value = Number(factor.detail.match(/([\d.]+)/)?.[1])
      if (!Number.isFinite(value)) continue
      if (factor.key === 'ltv') bucket.ltv.push(value)
      if (factor.key === 'dscr') bucket.dscr.push(value)
      if (factor.key === 'debt_yield') bucket.dy.push(value)
    }
    const metric = metrics.find((m) => m.deal_id === deal.id)
    if (metric?.occupancy_pct != null) bucket.occ.push(metric.occupancy_pct)
    for (const indication of indications.filter((i) => i.deal_id === deal.id)) {
      bucket.rate.push(indication.all_in_rate_pct)
    }
    groups.set(cohort, bucket)
  }

  return [...groups.entries()]
    .map(([cohort, bucket]) => ({
      dimension: by,
      cohort,
      sampleSize: Math.max(bucket.ltv.length, bucket.occ.length),
      medianLtvPct: median(bucket.ltv),
      medianDscr: median(bucket.dscr),
      medianDebtYieldPct: median(bucket.dy),
      medianOccupancyPct: median(bucket.occ),
      medianRatePct: median(bucket.rate),
    }))
    // Suppress cohorts too small to be genuinely anonymous.
    .filter((row) => row.sampleSize >= MIN_BENCHMARK_COHORT)
    .sort((a, b) => b.sampleSize - a.sampleSize)
}
