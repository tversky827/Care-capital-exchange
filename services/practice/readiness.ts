import 'server-only'
import { db } from '@/db'
import { GLOSSARY } from '@/lib/sandbox/glossary'
import { diversification, portfolioFor } from './portfolio'
import type { PracticeAccount } from '@/types/practice'

/**
 * How much of the sandbox somebody has actually used.
 *
 * Measured against things they did, never against how their practice portfolio
 * performed. That distinction is the whole design: a score that went up when a
 * simulated investment did well would be teaching that picking winners in a
 * simulation is evidence of something, and it is evidence of nothing — the
 * simulation runs on the sponsor's own assumptions, so "doing well" means
 * having chosen the raise with the most optimistic ones.
 *
 * It is not a qualification, an accreditation, a credit score or a permission.
 * It does not affect eligibility to invest and is never shown to a sponsor.
 */

export interface ReadinessStep {
  key: string
  label: string
  detail: string
  done: boolean
}

export interface Readiness {
  steps: ReadinessStep[]
  done: number
  total: number
}

export async function readinessFor(account: PracticeAccount): Promise<Readiness> {
  const store = await db()
  const [portfolio, scenarios, watched, activity] = await Promise.all([
    portfolioFor(account.id),
    store.count('practice_scenarios', { where: { account_id: account.id } }),
    store.count('practice_watchlist', { where: { account_id: account.id } }),
    store.select('practice_activity', { where: { account_id: account.id } }),
  ])
  const spread = diversification(portfolio)

  const distributions = activity.filter((row) => row.kind === 'distribution').length
  const exits = activity.filter((row) => row.kind === 'exited').length
  const states = new Set(portfolio.byState.map((row) => row.label)).size
  const sponsors = new Set(portfolio.bySponsor.map((row) => row.label)).size

  const steps: ReadinessStep[] = [
    {
      key: 'invested',
      label: 'Made a practice investment',
      detail: 'Walked the ticket from an amount to a confirmation.',
      done: portfolio.holdings.length > 0,
    },
    {
      key: 'several',
      label: 'Built a portfolio rather than a position',
      detail: 'Four or more separate raises. Concentration is a decision; making it by accident is not.',
      done: portfolio.holdings.length >= 4,
    },
    {
      key: 'spread',
      label: 'Spread it across sponsors and states',
      detail: `${sponsors} sponsor${sponsors === 1 ? '' : 's'}, ${states} state${states === 1 ? '' : 's'}.`,
      done: spread.rules.filter((rule) => rule.met).length >= 2,
    },
    {
      key: 'distribution',
      label: 'Watched a distribution work through a waterfall',
      detail: 'Saw the split between preferred return and return of capital on a real structure.',
      done: distributions > 0,
    },
    {
      key: 'exit',
      label: 'Took a holding through to a sale',
      detail: 'Saw the whole shape of a return rather than the first quarter of one.',
      done: exits > 0,
    },
    {
      key: 'scenario',
      label: 'Stress-tested an assumption',
      detail: 'Moved occupancy, labour or the exit multiple and watched what the model did.',
      done: scenarios > 0,
    },
    {
      key: 'watchlist',
      label: 'Kept something to come back to',
      detail: 'Saved a raise rather than deciding on it in one sitting.',
      done: watched > 0,
    },
  ]

  return { steps, done: steps.filter((step) => step.done).length, total: steps.length }
}

/** The glossary, for the education panel. Exported here so pages import one module. */
export { GLOSSARY }
