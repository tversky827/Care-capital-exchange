import 'server-only'
import { db } from '@/db'
import { cents, type Cents } from '@/lib/money'
import { round } from '@/lib/finance/calculations'
import { irr, type CashFlow } from '@/lib/equity/returns'
import type { Deal, Facility, Sponsor } from '@/types'
import type { Offering, OfferingTerms } from '@/types/equity'
import type { PracticePosition } from '@/types/practice'
import { balanceFor } from './ledger'

/**
 * The hypothetical portfolio.
 *
 * Every figure here is labelled hypothetical wherever it is shown, and this
 * module is where that has to be true rather than merely written. Nothing is
 * marked to a sponsor's estimate of value: a practice holding is carried at
 * what was put in until a simulated distribution or sale pays something out.
 * The alternative — showing an estimated value that moves — would teach a
 * person to read a number the live product is careful to call an opinion.
 *
 * Concentration is computed against invested capital rather than against
 * account value, because the question it answers is "how much of what I
 * committed is riding on one sponsor", and idle cash is not riding on anyone.
 */

export interface PracticeHolding {
  position: PracticePosition
  offering: Offering | null
  terms: OfferingTerms | null
  deal: Deal | null
  facility: Facility | null
  sponsor: Sponsor | null
  /** Distributions plus any exit proceeds, in cents. */
  returnedCents: Cents
  /** Returned less invested. Negative until the holding has paid its cost back. */
  gainCents: Cents
  /** Returned divided by invested. Null before anything has been paid. */
  multiple: number | null
}

export interface PracticeConcentration {
  label: string
  cents: Cents
  share: number
}

export interface PracticePortfolio {
  cashCents: Cents
  investedCents: Cents
  distributionsCents: Cents
  exitProceedsCents: Cents
  /** Cash plus what is still invested at cost. Never a mark to an estimate. */
  accountValueCents: Cents
  holdings: PracticeHolding[]
  active: number
  exited: number
  /** Hypothetical, and computed from the simulated flows only. */
  hypotheticalMultiple: number | null
  hypotheticalIrrPct: number | null
  bySponsor: PracticeConcentration[]
  byState: PracticeConcentration[]
  byAssetType: PracticeConcentration[]
}

export async function portfolioFor(accountId: string): Promise<PracticePortfolio> {
  const store = await db()
  const [cash, positions, entries] = await Promise.all([
    balanceFor(accountId),
    store.select('practice_positions', {
      where: { account_id: accountId },
      orderBy: { field: 'acquired_at', dir: 'desc' },
    }),
    store.select('practice_ledger_entries', {
      where: { account_id: accountId, reference_type: 'position' },
    }),
  ])

  const entriesByPosition = new Map<string, typeof entries>()
  for (const entry of entries) {
    if (!entry.reference_id) continue
    entriesByPosition.set(entry.reference_id, [
      ...(entriesByPosition.get(entry.reference_id) ?? []), entry,
    ])
  }

  const holdings: PracticeHolding[] = []
  const flows: CashFlow[] = []
  const bySponsor = new Map<string, number>()
  const byState = new Map<string, number>()
  const byAssetType = new Map<string, number>()

  let investedCents = 0
  let distributionsCents = 0
  let exitProceedsCents = 0
  let activeCostCents = 0
  let horizon = 0

  for (const position of positions) {
    const [offering, deal] = await Promise.all([
      store.findById('offerings', position.offering_id),
      store.findById('deals', position.deal_id),
    ])
    const [terms, facility, sponsor] = await Promise.all([
      offering
        ? store.selectOne('offering_terms', { where: { offering_id: offering.id } })
        : Promise.resolve(null),
      deal ? store.selectOne('facilities', { where: { deal_id: deal.id } }) : Promise.resolve(null),
      deal ? store.selectOne('sponsors', { where: { deal_id: deal.id } }) : Promise.resolve(null),
    ])

    const returned = cents(position.distributions_cents + position.exit_proceeds_cents)
    holdings.push({
      position,
      offering,
      terms,
      deal,
      facility,
      sponsor,
      returnedCents: returned,
      gainCents: cents(returned - position.invested_cents),
      multiple: position.invested_cents > 0
        ? round(returned / position.invested_cents, 2)
        : null,
    })

    investedCents += position.invested_cents
    distributionsCents += position.distributions_cents
    exitProceedsCents += position.exit_proceeds_cents
    if (position.status === 'active') activeCostCents += position.invested_cents

    // Concentration counts what was put in, whether or not it has been exited:
    // the exercise is about how a portfolio was built, not what survives.
    const add = (map: Map<string, number>, key: string) =>
      map.set(key, (map.get(key) ?? 0) + position.invested_cents)
    add(bySponsor, sponsor?.legal_entity ?? 'Not stated')
    add(byState, facility?.state ?? 'Not stated')
    add(byAssetType, deal?.asset_type ?? 'Not stated')

    // The hypothetical rate is measured in simulated periods, not wall-clock
    // time. A person can simulate four quarters in thirty seconds; dating the
    // flows by when they clicked would report an annual return in the millions
    // of percent. Period 0 is the contribution and each simulated payment
    // advances one quarter, which is what the simulation actually represents.
    flows.push({ period: 0, amount: -position.invested_cents / 100 })
    const paid = (entriesByPosition.get(position.id) ?? [])
      .filter((entry) => entry.amount_cents > 0)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    paid.forEach((entry, index) => {
      flows.push({ period: index + 1, amount: entry.amount_cents / 100 })
    })
    horizon = Math.max(horizon, paid.length)
  }

  // A holding that has not been sold still has to be worth something for a
  // rate to mean anything. Without a terminal value the arithmetic reports the
  // rate of never getting the capital back: one profitable quarter into a
  // five-year hold came out as -100% a year, which is true of those two flows
  // and says nothing about the investment.
  //
  // The live portfolio closes the same gap with the sponsor's estimate of
  // value. This one has no estimate to use and refuses to invent one, so it
  // closes it at cost — which states the assumption exactly: what the rate
  // would be if everything still held were sold today for what was paid for
  // it. That is conservative for a raise that is going well and generous for
  // one that is not, and the page says so.
  if (activeCostCents > 0) {
    flows.push({ period: Math.max(1, horizon), amount: activeCostCents / 100 })
  }

  const returnedTotal = distributionsCents + exitProceedsCents
  const share = (value: number) => (investedCents > 0 ? value / investedCents : 0)
  const rank = (map: Map<string, number>): PracticeConcentration[] =>
    [...map.entries()]
      .map(([label, value]) => ({ label, cents: cents(value), share: share(value) }))
      .sort((a, b) => b.cents - a.cents)

  return {
    cashCents: cash,
    investedCents: cents(investedCents),
    distributionsCents: cents(distributionsCents),
    exitProceedsCents: cents(exitProceedsCents),
    accountValueCents: cents(cash + activeCostCents),
    holdings,
    active: positions.filter((row) => row.status === 'active').length,
    exited: positions.filter((row) => row.status === 'exited').length,
    hypotheticalMultiple: investedCents > 0 ? round(returnedTotal / investedCents, 2) : null,
    // Only meaningful once something has actually been paid back; before that
    // it is the IRR of a portfolio that has only ever spent, which is -100%.
    // Solved per quarter, then stated as an annual rate. Withheld until
    // something has actually been paid: before that the only fact is that
    // money went out, and a rate on that is -100% however long the hold is.
    hypotheticalIrrPct: returnedTotal > 0 ? irr(flows, 4) : null,
    bySponsor: rank(bySponsor),
    byState: rank(byState),
    byAssetType: rank(byAssetType),
  }
}

/**
 * How diversified the portfolio is, against the exercise's own rules.
 *
 * Educational only. It measures whether a portfolio was spread, not whether it
 * was a good one — a concentrated portfolio can be the better decision, and
 * nothing here should be read as saying otherwise.
 */
export interface DiversificationRule {
  key: string
  label: string
  met: boolean
  detail: string
}

export const DIVERSIFICATION_RULES = {
  /** No more than this share of invested capital with one sponsor. */
  maxSponsorShare: 0.3,
  /** No more than this share in one state. */
  maxStateShare: 0.4,
  /** At least this many separate holdings. */
  minHoldings: 4,
} as const

export function diversification(portfolio: PracticePortfolio): {
  rules: DiversificationRule[]
  score: number
} {
  const topSponsor = portfolio.bySponsor[0]?.share ?? 0
  const topState = portfolio.byState[0]?.share ?? 0
  const holdings = portfolio.holdings.length

  const pct = (value: number) => `${Math.round(value * 100)}%`
  const rules: DiversificationRule[] = [
    {
      key: 'sponsor',
      label: `No more than ${pct(DIVERSIFICATION_RULES.maxSponsorShare)} with one sponsor`,
      met: holdings > 0 && topSponsor <= DIVERSIFICATION_RULES.maxSponsorShare,
      detail: holdings === 0
        ? 'Nothing invested yet.'
        : `Largest is ${pct(topSponsor)} with ${portfolio.bySponsor[0]?.label}.`,
    },
    {
      key: 'state',
      label: `No more than ${pct(DIVERSIFICATION_RULES.maxStateShare)} in one state`,
      met: holdings > 0 && topState <= DIVERSIFICATION_RULES.maxStateShare,
      detail: holdings === 0
        ? 'Nothing invested yet.'
        : `Largest is ${pct(topState)} in ${portfolio.byState[0]?.label}.`,
    },
    {
      key: 'count',
      label: `At least ${DIVERSIFICATION_RULES.minHoldings} separate investments`,
      met: holdings >= DIVERSIFICATION_RULES.minHoldings,
      detail: `${holdings} held.`,
    },
  ]

  return { rules, score: rules.filter((rule) => rule.met).length / rules.length }
}
