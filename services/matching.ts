import 'server-only'
import { db } from '@/db'
import { explainMatch } from '@/lib/ai/local/match-explain'
import { runAi } from '@/lib/ai/provider'
import { matchExplanationSchema } from '@/lib/ai/schemas'
import { buildSnapshot, type DealSnapshot } from '@/lib/deal/snapshot'
import { matchDeal, type MatchableBox, type MatchableDeal } from '@/lib/matching/engine'
import { scoreDeal } from '@/lib/underwriting/score'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { titleize } from '@/lib/utils/format'
import type { Lender, LendingBox, Match } from '@/types'

/**
 * Match computation.
 *
 * Deterministic scoring runs against every verified lender's active lending
 * box; the qualitative explanation is layered on afterwards and cannot change
 * the score. Matches are recomputed whenever the deal's underwriting inputs
 * change, and stored so both sides of the marketplace see the same number.
 */

export function toMatchableDeal(snapshot: DealSnapshot): MatchableDeal {
  const { deal, facility, metrics, sponsor, summary, terms } = snapshot
  const daysToClose = terms?.target_close_date
    ? Math.ceil((new Date(terms.target_close_date).getTime() - Date.now()) / 86_400_000)
    : null
  return {
    assetType: deal.asset_type,
    transactionType: deal.transaction_type,
    state: facility?.state ?? '',
    loanAmount: summary.loanAmount,
    ltvPct: summary.ltv,
    dscr: summary.dscr,
    debtYieldPct: summary.debtYield,
    occupancyPct: facility?.occupancy_pct ?? metrics?.occupancy_pct ?? summary.occupancyPct,
    medicaidPct: metrics?.medicaid_pct ?? null,
    privatePayPct: metrics?.private_pay_pct ?? null,
    sponsorYearsExperience: sponsor?.years_in_healthcare ?? null,
    sponsorFacilitiesOperated: sponsor?.facilities_operated ?? null,
    daysToClose,
  }
}

export function toMatchableBox(box: LendingBox): MatchableBox {
  return {
    minLoan: box.min_loan,
    maxLoan: box.max_loan,
    maxLtvPct: box.max_ltv_pct,
    minDscr: box.min_dscr,
    minDebtYieldPct: box.min_debt_yield_pct,
    minOccupancyPct: box.min_occupancy_pct,
    states: box.states,
    excludedStates: box.excluded_states,
    assetTypes: box.asset_types,
    excludedAssetTypes: box.excluded_asset_types,
    transactionTypes: box.transaction_types,
    minOperatorYears: box.min_operator_years,
    minFacilitiesOperated: box.min_facilities_operated,
    maxMedicaidPct: box.max_medicaid_pct,
    minPrivatePayPct: box.min_private_pay_pct,
    preferredDealSize: box.preferred_deal_size,
  }
}

export interface ComputeMatchesResult {
  matches: Match[]
  inBox: number
  outsideBox: number
}

export async function computeMatches(
  dealId: string,
  options: { explain?: boolean } = {},
): Promise<ComputeMatchesResult> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) throw new Error('Deal not found.')

  const lenders = await store.select('lenders', { where: { verification_status: 'verified' } })
  const boxes = await store.select('lender_lending_boxes', { where: { active: true } })
  const existing = await store.select('matches', { where: { deal_id: dealId } })
  const byLender = new Map(existing.map((m) => [m.lender_id, m]))

  const matchable = toMatchableDeal(snapshot)
  const results: Match[] = []
  const now = new Date().toISOString()

  for (const lender of lenders) {
    const box = boxes.find((b) => b.lender_id === lender.id)
    if (!box) continue

    const outcome = matchDeal(matchable, toMatchableBox(box))
    let explanation: string | null = null

    // Explanations are only worth generating for lenders actually in the box.
    if (options.explain !== false && !outcome.hardFail) {
      const explained = await runAi({
        task: 'match_explanation',
        instruction:
          'Explain, for a borrower, how this financing opportunity measures against this lender\'s published lending criteria. Never state or imply that the lender will approve or offer financing.',
        schema: matchExplanationSchema,
        schemaName: 'MatchExplanation',
        schemaHint: '{ headline: string, narrative: string, concerns: string[] }',
        context: { lender: lender.institution_name, factors: outcome.factors, score: outcome.score, band: outcome.band },
        local: () =>
          explainMatch(outcome, lender.institution_name, {
            loanAmount: matchable.loanAmount,
            assetLabel: titleize(matchable.assetType),
            state: matchable.state,
          }),
      })
      explanation = explained.data.narrative
    } else if (outcome.hardFail) {
      explanation = explainMatch(outcome, lender.institution_name, {
        loanAmount: matchable.loanAmount,
        assetLabel: titleize(matchable.assetType),
        state: matchable.state,
      }).narrative
    }

    const payload = {
      deal_id: dealId,
      lender_id: lender.id,
      lending_box_id: box.id,
      score: outcome.score,
      band: outcome.band,
      hard_fail: outcome.hardFail,
      factors: outcome.factors,
      ai_explanation: explanation,
      concerns: outcome.concerns,
      computed_at: now,
    }

    const current = byLender.get(lender.id)
    results.push(
      current
        ? await store.update('matches', current.id, payload)
        : await store.insert('matches', payload as Omit<Match, 'id' | 'created_at'>),
    )
  }

  const inBox = results.filter((m) => !m.hard_fail).length
  const newStrong = results.filter(
    (m) => !m.hard_fail && m.band === 'strong' && !byLender.has(m.lender_id),
  )

  if (newStrong.length) {
    await notify({
      event: 'match.found',
      companyId: snapshot.deal.company_id,
      dealId,
      title: `${newStrong.length} new strong lender match${newStrong.length === 1 ? '' : 'es'}`,
      body: `${inBox} lender${inBox === 1 ? '' : 's'} now match this opportunity based on their stated criteria.`,
      href: `/deals/${dealId}/matches`,
    })
  }

  await recordAudit({
    actor: null,
    action: 'matches.computed',
    entityType: 'deal',
    entityId: dealId,
    dealId,
    summary: `Matched against ${lenders.length} verified lenders: ${inBox} inside their stated criteria.`,
    metadata: { evaluated: lenders.length, inBox },
  })

  return { matches: results, inBox, outsideBox: results.length - inBox }
}

export interface MatchWithLender {
  match: Match
  lender: Lender
  box: LendingBox | null
}

export async function matchesForDeal(dealId: string, includeOutOfBox = false): Promise<MatchWithLender[]> {
  const store = await db()
  const matches = await store.select('matches', { where: { deal_id: dealId } })
  const lenders = await store.select('lenders', {})
  const boxes = await store.select('lender_lending_boxes', {})
  return matches
    .filter((m) => includeOutOfBox || !m.hard_fail)
    .map((match) => ({
      match,
      lender: lenders.find((l) => l.id === match.lender_id)!,
      box: boxes.find((b) => b.id === match.lending_box_id) ?? null,
    }))
    .filter((row) => Boolean(row.lender))
    .sort((a, b) => b.match.score - a.match.score)
}

/** The deal-quality input to marketplace relevance ranking. */
export async function dealQualityScore(dealId: string): Promise<number> {
  const snapshot = await buildSnapshot(dealId)
  return snapshot ? scoreDeal(snapshot).overall : 0
}
