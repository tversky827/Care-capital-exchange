import type { Environment } from '@/lib/environment'

/**
 * The guided demonstration.
 *
 * A sequence of steps, each with somewhere to go and one sentence explaining
 * what the person watching should look at when they get there. It is not a
 * tutorial overlay and it does not take over the product: every step is a link
 * into the ordinary interface, because the thing being demonstrated is the
 * ordinary interface.
 *
 * The whole run is meant to take four or five minutes. That is a constraint on
 * the number of steps, which is why there are nine rather than twenty — a
 * demonstration that shows everything shows nothing, and the questions a
 * prospective investor actually asks are few and always the same.
 */

export interface GuideStep {
  key: string
  title: string
  /** What the presenter says, roughly. One sentence. */
  say: string
  /** What to point at once the page loads. */
  look: string
  /** Where the step goes. Given a live raise's id where one is needed. */
  href: (offeringId: string | null) => string
  /** Roughly how long this step takes, in seconds, for the running total. */
  seconds: number
}

export const GUIDE: GuideStep[] = [
  {
    key: 'browse',
    title: 'Start with what is open',
    say: 'This is the marketplace: every raise an operator has open, with what it targets and what it asks for.',
    look: 'The target return and the minimum on each card, and how much of each raise is already spoken for.',
    href: () => '/investments',
    seconds: 30,
  },
  {
    key: 'open',
    title: 'Open one',
    say: 'Four questions in order: what is it, what could it pay, what could go wrong, and who is running it.',
    look: 'The four figures across the top. That is the whole decision in one line.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 40,
  },
  {
    key: 'returns',
    title: 'Show where the return comes from',
    say: 'Every projected figure is computed from assumptions the operator stated, and you can open the working.',
    look: 'Expand the year-by-year table, then the list of assumptions underneath it.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 45,
  },
  {
    key: 'risk',
    title: 'Show what could go wrong',
    say: 'The same record scored for risk, with the downside case computed rather than described.',
    look: 'The score, then "What if it goes badly?" — that runs the model again on worse assumptions.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 40,
  },
  {
    key: 'documents',
    title: 'Open the data room',
    say: 'Every figure above came out of these documents, and the release ladder decides who sees which.',
    look: 'The documents list, and the note about what becomes available at the next access level.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 30,
  },
  {
    key: 'ask',
    title: 'Ask it something',
    say: 'Ask a question about the deal and it answers from the record, with citations, or says it does not know.',
    look: 'Try "what are the three biggest risks?" and watch it cite where each answer came from.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 45,
  },
  {
    key: 'invest',
    title: 'Invest',
    say: 'Amount, then a review stating the fees, the terms and what the cash becomes, then one confirmation.',
    look: 'The review step. It says what this does and, in the sandbox, what it does not.',
    href: (id) => (id ? `/investments/${id}` : '/investments'),
    seconds: 50,
  },
  {
    key: 'portfolio',
    title: 'Show the portfolio',
    say: 'The cash went down, a holding appeared, and the ledger recorded both.',
    look: 'The four figures, then the holding, then the concentration bars underneath.',
    href: () => '/sandbox/portfolio',
    seconds: 40,
  },
  {
    key: 'simulate',
    title: 'Advance time',
    say: 'Simulate a quarter and the distribution is worked through that raise’s own waterfall.',
    look: 'The cash going up, and the split between preferred return and return of capital.',
    href: () => '/sandbox/portfolio',
    seconds: 40,
  },
]

export const GUIDE_SECONDS = GUIDE.reduce((total, step) => total + step.seconds, 0)

/** The perspectives a presenter can switch between. */
export interface Persona {
  key: string
  label: string
  detail: string
  href: string
  requires: 'sponsor' | 'admin' | 'any'
}

export const PERSONAS: Persona[] = [
  {
    key: 'investor',
    label: 'Investor',
    detail: 'What somebody deciding whether to invest sees: the marketplace, a raise, and their portfolio.',
    href: '/sandbox/home',
    requires: 'any',
  },
  {
    key: 'sponsor',
    label: 'Operator',
    detail: 'What the operator raising the money sees: their property, the raise, and who has indicated interest.',
    href: '/deals',
    requires: 'sponsor',
  },
  {
    key: 'admin',
    label: 'Administrator',
    detail: 'What the platform sees: every raise awaiting review, the audit log, and the fee record.',
    href: '/admin',
    requires: 'admin',
  },
]

/** Whether an environment should offer the guided run at all. */
export function guideAvailable(environment: Environment): boolean {
  return environment !== 'live'
}
