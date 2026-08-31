import 'server-only'
import { db } from '@/db'
import type { SandboxEnvironment } from '@/lib/environment'

/**
 * What the sandbox is used for.
 *
 * Counts of events, and nothing else. No identity, no address, no user agent,
 * no path through the product — the question worth answering is "does anybody
 * get as far as simulating a distribution", and that is answerable from counts.
 *
 * It reads the sandbox's own activity table rather than writing a second one.
 * A parallel analytics log would be a second record of the same events that
 * could disagree with the first, and a place where somebody would eventually
 * put a field the activity table deliberately does not have.
 */

export interface SandboxUsage {
  environment: SandboxEnvironment | 'all'
  accountsOpened: number
  cashAdded: number
  investments: number
  distributions: number
  exits: number
  scenarios: number
  watchlisted: number
  resets: number
  /** Accounts that got as far as an investment, over accounts opened. */
  investedShare: number
}

export async function sandboxUsage(
  environment?: SandboxEnvironment,
): Promise<SandboxUsage> {
  const store = await db()
  const [accounts, activity] = await Promise.all([
    store.select('practice_accounts', environment ? { where: { environment } } : {}),
    store.select('practice_activity', environment ? { where: { environment } } : {}),
  ])

  const count = (kind: string) => activity.filter((row) => row.kind === kind).length
  const invested = new Set(
    activity.filter((row) => row.kind === 'invested').map((row) => row.account_id),
  ).size

  return {
    environment: environment ?? 'all',
    accountsOpened: accounts.length,
    cashAdded: count('cash_added'),
    investments: count('invested'),
    distributions: count('distribution'),
    exits: count('exited'),
    scenarios: count('scenario_run'),
    watchlisted: count('watchlist_added'),
    resets: count('reset'),
    investedShare: accounts.length > 0 ? invested / accounts.length : 0,
  }
}
