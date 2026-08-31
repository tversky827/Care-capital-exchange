import 'server-only'
import { db } from '@/db'
import { inCatalogue, type Catalogue } from '@/lib/catalogue'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { scoreMatch, type MatchInput } from '@/lib/equity/matching'
import { checkEligibility } from '@/lib/equity/eligibility'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import type { Actor } from '@/lib/auth/session'
import type { InvestorMatch, Offering } from '@/types/equity'

/**
 * Investor matching.
 *
 * Deterministic scoring is computed here and cached, exactly as lender matches
 * are. Two things this service is careful about:
 *
 * The word "match" never means "recommendation". A match says an offering has
 * the characteristics an investor said they look for, and the reasons are
 * shown alongside so the investor can judge the claim themselves.
 *
 * A sponsor is told how many investors matched, never which. The count is a
 * useful signal about a raise; the list would be a directory of other people's
 * private investment preferences.
 */

/** Recomputes every eligible investor's fit with one offering. */
export async function computeMatchesForOffering(offeringId: string): Promise<InvestorMatch[]> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) return []

  const [terms, eligibility, snapshot, investors] = await Promise.all([
    store.selectOne('offering_terms', { where: { offering_id: offeringId } }),
    store.selectOne('offering_eligibility', { where: { offering_id: offeringId } }),
    buildSnapshot(offering.deal_id),
    store.select('investor_profiles', { where: { status: 'active' } }),
  ])
  if (!snapshot) return []

  const leverage = leverageOf(snapshot.summary.loanAmount, snapshot.summary.totalCost)
  const results: InvestorMatch[] = []

  for (const investor of investors) {
    const [preferences, verifications] = await Promise.all([
      store.selectOne('investor_preferences', { where: { investor_id: investor.id } }),
      store.select('investor_verifications', { where: { investor_id: investor.id } }),
    ])

    // Eligibility is evaluated first: an investor this offering cannot accept
    // is scored anyway, so they can see why, but is flagged plainly.
    const eligibilityResult = checkEligibility({
      offering,
      eligibility,
      investor,
      verifications,
      committedToDate: 0,
      // Acknowledgement is not part of discoverability; it is checked at the
      // point of commitment, where it belongs.
      disclosuresAcknowledged: true,
    })
    const hardBlock = eligibilityResult.verdict === 'not_eligible'

    const input: MatchInput = {
      offering,
      terms,
      deal: snapshot.deal,
      facility: snapshot.facility,
      leveragePct: leverage,
      investor,
      preferences,
      ineligibleReason: hardBlock ? eligibilityResult.summary : null,
    }
    const scored = scoreMatch(input)

    const existing = await store.selectOne('investor_matches', {
      where: { offering_id: offeringId, investor_id: investor.id },
    })
    const row = {
      offering_id: offeringId,
      investor_id: investor.id,
      deal_id: offering.deal_id,
      score: scored.score,
      band: scored.band,
      reasons: scored.reasons,
      concerns: scored.concerns,
      ineligible: scored.ineligible,
      ineligible_reason: scored.ineligibleReason,
      computed_at: new Date().toISOString(),
    }
    const saved = existing
      ? await store.update('investor_matches', existing.id, row as Partial<InvestorMatch>)
      : await store.insert('investor_matches', row as Omit<InvestorMatch, 'id' | 'created_at'>)
    results.push(saved)

    // A strong fit on a live offering is worth telling someone about; a weak
    // one is not, and an ineligible one certainly is not.
    if (offering.status === 'live' && scored.band === 'strong' && !scored.ineligible && !existing) {
      await notify({
        event: 'offering.matched',
        companyId: investor.company_id,
        title: `New opportunity: ${offering.name}`,
        body: 'This offering is consistent with the preferences you have set.',
        href: `/investments/${offeringId}`,
        dealId: offering.deal_id,
      })
    }
  }
  return results
}

/** Recomputes one investor's fit across every published offering. */
export async function computeMatchesForInvestor(investorId: string): Promise<InvestorMatch[]> {
  const store = await db()
  // Matching runs against the live catalogue only. A demonstration raise is
  // not something anybody should be matched to.
  const live = (await store.select('offerings', { where: { status: 'live' } }))
    .filter((offering) => inCatalogue(offering, 'live'))
  const results: InvestorMatch[] = []
  for (const offering of live) {
    const matches = await computeMatchesForOffering(offering.id)
    const mine = matches.find((m) => m.investor_id === investorId)
    if (mine) results.push(mine)
  }
  return results
}

/**
 * Drops an investor's cached matches so they are recomputed on next read.
 * Called whenever preferences change, since every score depended on them.
 */
export async function invalidateMatchesFor(investorId: string): Promise<void> {
  const store = await db()
  const existing = await store.select('investor_matches', { where: { investor_id: investorId } })
  for (const match of existing) await store.remove('investor_matches', match.id)
}

/** An investor's matches, best first, recomputing them when the cache is cold. */
export async function matchesForInvestor(
  investorId: string,
  options: { includeIneligible?: boolean } = {},
): Promise<{ match: InvestorMatch; offering: Offering }[]> {
  const store = await db()
  let matches = await store.select('investor_matches', {
    where: { investor_id: investorId },
    orderBy: { field: 'score', dir: 'desc' },
  })
  if (matches.length === 0) {
    await computeMatchesForInvestor(investorId)
    matches = await store.select('investor_matches', {
      where: { investor_id: investorId },
      orderBy: { field: 'score', dir: 'desc' },
    })
  }

  const rows: { match: InvestorMatch; offering: Offering }[] = []
  for (const match of matches) {
    if (match.ineligible && !options.includeIneligible) continue
    const offering = await store.findById('offerings', match.offering_id)
    // Only published offerings ever reach an investor, whatever the cache holds.
    if (!offering || offering.status === 'draft' || offering.status === 'under_review'
      || offering.status === 'compliance_review' || offering.status === 'ready'
      || offering.status === 'cancelled') continue
    rows.push({ match, offering })
  }
  return rows
}

/**
 * How many investors an offering matches, and how strongly.
 *
 * This is what a sponsor sees. It deliberately returns counts and nothing that
 * could identify an investor.
 */
export async function matchCountsForOffering(offeringId: string): Promise<{
  total: number
  strong: number
  possible: number
}> {
  const store = await db()
  const matches = await store.select('investor_matches', { where: { offering_id: offeringId } })
  const eligible = matches.filter((m) => !m.ineligible)
  return {
    total: eligible.length,
    strong: eligible.filter((m) => m.band === 'strong').length,
    possible: eligible.filter((m) => m.band === 'possible').length,
  }
}

/** Recomputes matches on demand, for an administrator or the sponsor. */
export async function recomputeMatches(actor: Actor, offeringId: string): Promise<number> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) throw new Error('Offering not found.')
  const matches = await computeMatchesForOffering(offeringId)
  await recordAudit({
    actor, action: 'offering.matches_recomputed', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `Investor matching recomputed: ${matches.length} investors scored.`,
  })
  return matches.length
}

function leverageOf(loanAmount: number | null, totalCost: number | null): number | null {
  if (loanAmount === null || totalCost === null || totalCost <= 0) return null
  return loanAmount / totalCost
}

// ---------------------------------------------------------------------------
// Search, saved investments, comparison
// ---------------------------------------------------------------------------

export interface OfferingSearch {
  assetTypes?: string[]
  states?: string[]
  capitalPositions?: string[]
  maxMinimum?: number | null
  minTargetRaise?: number | null
  maxTargetRaise?: number | null
  maxHoldMonths?: number | null
  minTargetReturnPct?: number | null
  status?: 'live' | 'all'
  sponsor?: string | null
  query?: string | null
}

export interface SearchRow {
  offering: import('@/types/equity').Offering
  terms: import('@/types/equity').OfferingTerms | null
  deal: import('@/types').Deal
  facility: import('@/types').Facility | null
  match: InvestorMatch | null
  saved: boolean
}

/**
 * Filters the published marketplace.
 *
 * Filtering happens in the query layer rather than the browser so a listing
 * never carries offerings the viewer then has to be prevented from seeing.
 * Unpublished offerings are excluded before any filter is applied.
 */
export async function searchOfferings(
  investorId: string | null,
  search: OfferingSearch = {},
  /**
   * Which catalogue to read. Defaults to the live one, so a caller that has
   * never heard of the demonstration catalogue cannot accidentally surface it
   * — a fictional raise appearing in the real marketplace is the one failure
   * this whole split exists to prevent.
   */
  catalogue: Catalogue = 'live',
): Promise<SearchRow[]> {
  const store = await db()
  const all = await store.select('offerings', { orderBy: { field: 'published_at', dir: 'desc' } })
  const visible = all.filter((offering) => {
    if (!inCatalogue(offering, catalogue)) return false
    if (search.status === 'all') {
      return ['live', 'paused', 'fully_subscribed', 'closed'].includes(offering.status)
    }
    return offering.status === 'live'
  })

  const [matches, saved] = investorId
    ? await Promise.all([
      store.select('investor_matches', { where: { investor_id: investorId } }),
      store.select('saved_investments', { where: { investor_id: investorId } }),
    ])
    : [[], []]

  const rows: SearchRow[] = []
  for (const offering of visible) {
    const [terms, deal] = await Promise.all([
      store.selectOne('offering_terms', { where: { offering_id: offering.id } }),
      store.findById('deals', offering.deal_id),
    ])
    if (!deal) continue
    const facility = await store.selectOne('facilities', { where: { deal_id: deal.id } })

    if (search.assetTypes?.length && !search.assetTypes.includes(deal.asset_type)) continue
    if (search.states?.length && (!facility?.state || !search.states.includes(facility.state))) continue
    if (search.capitalPositions?.length
      && (!terms || !search.capitalPositions.includes(terms.capital_position))) continue
    if (search.maxMinimum != null
      && offering.minimum_investment !== null
      && offering.minimum_investment > search.maxMinimum) continue
    if (search.minTargetRaise != null
      && (offering.target_raise ?? 0) < search.minTargetRaise) continue
    if (search.maxTargetRaise != null
      && (offering.target_raise ?? Number.POSITIVE_INFINITY) > search.maxTargetRaise) continue
    if (search.maxHoldMonths != null
      && (terms?.target_hold_months ?? 0) > search.maxHoldMonths) continue
    if (search.minTargetReturnPct != null
      && (terms?.target_irr_pct ?? 0) < search.minTargetReturnPct) continue
    if (search.query) {
      const haystack = `${offering.name} ${offering.summary ?? ''} ${facility?.state ?? ''}`.toLowerCase()
      if (!haystack.includes(search.query.toLowerCase())) continue
    }

    rows.push({
      offering,
      terms,
      deal,
      facility,
      match: matches.find((m) => m.offering_id === offering.id) ?? null,
      saved: saved.some((s) => s.offering_id === offering.id),
    })
  }
  return rows
}

/** Adds or removes an offering from the investor's watchlist. */
export async function toggleSaved(
  actor: Actor,
  offeringId: string,
): Promise<{ saved: boolean }> {
  const { requireOwnProfile } = await import('./investors')
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const existing = await store.selectOne('saved_investments', {
    where: { investor_id: profile.id, offering_id: offeringId },
  })
  if (existing) {
    await store.remove('saved_investments', existing.id)
    return { saved: false }
  }
  await store.insert('saved_investments', {
    investor_id: profile.id,
    offering_id: offeringId,
    notify_on_change: true,
    notes: null,
  } as Omit<import('@/types/equity').SavedInvestment, 'id' | 'created_at'>)
  return { saved: true }
}

export async function savedOfferings(investorId: string): Promise<SearchRow[]> {
  const store = await db()
  const saved = await store.select('saved_investments', { where: { investor_id: investorId } })
  const ids = new Set(saved.map((s) => s.offering_id))
  const rows = await searchOfferings(investorId, { status: 'all' })
  return rows.filter((row) => ids.has(row.offering.id))
}
