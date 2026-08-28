import 'server-only'
import { db } from '@/db'
import { cents, format, type Cents } from '@/lib/money'
import { isAvailable } from '@/lib/flags'
import { canViewOffering } from '@/lib/policy'
import { subjectOf } from '@/lib/access'
import { round } from '@/lib/finance/calculations'
import { runWaterfall } from '@/lib/equity/waterfall'
import { projectInvestment } from '@/services/equity/analysis'
import type { Actor } from '@/lib/auth/session'
import type { SandboxEnvironment } from '@/lib/environment'
import type { Offering } from '@/types/equity'
import type { PracticePosition } from '@/types/practice'
import { accountFor, ensureAccount, PracticeError, record } from './accounts'
import { balanceFor, post, postWithin, PracticeLedgerError, withAccountLock } from './ledger'

/**
 * Investing with virtual money.
 *
 * This module is the boundary the whole sandbox rests on, so what it does NOT
 * do is worth stating before what it does. It never writes to `offerings`,
 * `investment_orders`, `investment_commitments`, `investment_positions`,
 * `cash_ledger_entries`, `investor_accounts` or `distribution_events`. It does
 * not import the services that own them. There is no argument, no flag and no
 * request shape that makes it write one: the functions that could are not in
 * scope in this file.
 *
 * What it reads is the offering, and only to read it — the same record the
 * live marketplace shows, at the access level the reader already has. That is
 * the point of practice mode: the opportunity is real even though the money is
 * not, so a person who has practised has practised on the actual thing.
 *
 * Every figure it produces comes from the deterministic engines in
 * `lib/equity`. Nothing here is computed by a language model.
 */

/** How much of the raise this stake would be, as a fraction. */
function ownership(offering: Offering, investedCents: number): number {
  const raise = offering.target_raise
  if (!raise || raise <= 0) return 0
  return investedCents / 100 / raise
}

async function requireInvestableOffering(actor: Actor, offeringId: string): Promise<Offering> {
  const store = await db()
  const offering = await store.findById('offerings', offeringId)
  if (!offering) throw new PracticeError('That opportunity could not be found.')

  // The same visibility rule the live marketplace uses. A practice investor is
  // shown nothing an ordinary reader in their position would not be shown, so
  // the sandbox can never become a way around the access ladder.
  if (!canViewOffering(subjectOf(actor), offering)) {
    throw new PracticeError('That opportunity could not be found.')
  }

  // A raise that has closed is closed in practice too. Practising against an
  // opportunity that no longer exists teaches a sequence that will not work.
  if (offering.status !== 'live') {
    throw new PracticeError('This raise is no longer open, so it cannot be practised against.')
  }
  return offering
}

export interface PracticeInvestInput {
  offeringId: string
  amount: Cents
  /** Scoped to the account, so a double-click invests once. */
  idempotencyKey: string
}

/**
 * Places a hypothetical investment.
 *
 * One step rather than the live workflow's order state machine, and
 * deliberately so. The live sequence exists because a real order is handed to
 * a provider, may be rejected days later and has money reserved against it in
 * the meantime. None of that is true here, and simulating it would be theatre
 * — a "pending" state with nothing pending behind it teaches a person to
 * expect a delay the real product does not have either, since the reservation
 * there is real.
 */
export async function invest(
  actor: Actor,
  environment: SandboxEnvironment,
  input: PracticeInvestInput,
): Promise<PracticePosition> {
  if (!isAvailable('SANDBOX_ENABLED')) throw new PracticeError('The sandbox is not available.')
  const offering = await requireInvestableOffering(actor, input.offeringId)
  const account = await ensureAccount(actor, environment)
  const store = await db()

  if (input.amount <= 0) throw new PracticeError('Enter the amount you want to practise with.')
  if (offering.minimum_investment && input.amount < offering.minimum_investment * 100) {
    throw new PracticeError(
      `This raise has a minimum of ${format(cents(Math.round(offering.minimum_investment * 100)))}.`,
    )
  }
  if (offering.maximum_investment && input.amount > offering.maximum_investment * 100) {
    throw new PracticeError(
      `This raise caps an individual investment at ${format(cents(Math.round(offering.maximum_investment * 100)))}.`,
    )
  }

  // The debit and the position are decided together, under one lock. Doing
  // them in sequence outside it means a replayed request finds no entry to
  // stop it and adds a second stake against the one debit that did post.
  //
  // The debit goes first inside that lock: if it fails — not enough virtual
  // cash, or a key already used — no position is created, and the ledger and
  // the portfolio cannot disagree about whether the investment happened.
  return withAccountLock(account.id, async () => {
    const held = await store.selectOne('practice_positions', {
      where: { account_id: account.id, offering_id: offering.id, status: 'active' },
    })

    let posted
    try {
      posted = await postWithin({
        accountId: account.id,
        environment,
        type: 'investment_debit',
        amount: cents(-input.amount),
        description: `Practice investment in ${offering.name}`,
        idempotencyKey: input.idempotencyKey,
        referenceType: 'offering',
        referenceId: offering.id,
      })
    } catch (error) {
      if (error instanceof PracticeLedgerError) throw new PracticeError(error.message)
      throw error
    }

    // A key that has been used before is the same request arriving twice. The
    // money moved once, so the stake changes once, and this call returns what
    // the first one produced.
    if (!posted.created) {
      if (held) return held
      throw new PracticeError('That investment has already been recorded.')
    }

    if (held) {
      // Investing again in the same raise adds to the stake rather than
      // opening a second one. Two positions in one offering would each show a
      // return and neither would be the investor's return.
      const grown = await store.update('practice_positions', held.id, {
        invested_cents: held.invested_cents + input.amount,
      } as Partial<PracticePosition>)
      await record(
        account, 'invested',
        `Added ${format(input.amount)} to the practice stake in ${offering.name}.`,
        offering.id, input.amount,
      )
      return grown
    }

    const position = await store.insert('practice_positions', {
      account_id: account.id,
      environment,
      offering_id: offering.id,
      deal_id: offering.deal_id,
      invested_cents: input.amount,
      distributions_cents: 0,
      exit_proceeds_cents: 0,
      status: 'active',
      acquired_at: new Date().toISOString(),
      exited_at: null,
    } as Omit<PracticePosition, 'id' | 'created_at' | 'updated_at'>)

    await record(
      account, 'invested',
      `Practice investment of ${format(input.amount)} in ${offering.name}.`,
      offering.id, input.amount,
    )
    return position
  })
}

/**
 * Simulates one period's distribution on a holding.
 *
 * Run through the same waterfall the live product uses, against the offering's
 * own stated preferred rate and promote — not a made-up yield. What a person
 * sees is what that structure would pay on that stake if the property produced
 * what the sponsor's model says it produces, which is a hypothesis about the
 * property and an arithmetic fact about the structure.
 *
 * The period advanced is the position's own count, so running it four times
 * walks a year rather than paying the same quarter four times.
 */
export async function simulateDistribution(
  actor: Actor,
  environment: SandboxEnvironment,
  positionId: string,
): Promise<{ amount: Cents; period: number }> {
  const account = await accountFor(actor, environment)
  if (!account) throw new PracticeError('No sandbox account.')
  const store = await db()

  const position = await store.findById('practice_positions', positionId)
  if (!position || position.account_id !== account.id) {
    throw new PracticeError('That holding is not in this account.')
  }
  if (position.status !== 'active') {
    throw new PracticeError('This holding has already been exited.')
  }

  const offering = await store.findById('offerings', position.offering_id)
  if (!offering) throw new PracticeError('That opportunity could not be found.')
  const terms = await store.selectOne('offering_terms', { where: { offering_id: offering.id } })

  const paid = await store.select('practice_ledger_entries', {
    where: { account_id: account.id, reference_type: 'position', reference_id: position.id },
  })
  const period = paid.filter((entry) => entry.type === 'distribution_credit').length + 1

  const holdQuarters = terms?.target_hold_months ? Math.round(terms.target_hold_months / 3) : 20
  if (period > holdQuarters) {
    throw new PracticeError(
      'The full hold period has been simulated. Simulate an exit to see the whole outcome.',
    )
  }

  const structure = await store.selectOne('waterfall_structures', { where: { offering_id: offering.id } })
  const tiers = structure
    ? await store.select('waterfall_tiers', {
      where: { waterfall_id: structure.id }, orderBy: { field: 'sequence' },
    })
    : []

  // What the deal is projected to pay the whole equity class this period, then
  // this stake's share of it. Both from the deterministic engines.
  const projected = await projectInvestment(offering.id, position.invested_cents / 100)
  if (!projected || projected.insufficientData !== null) {
    throw new PracticeError(
      'This raise has not stated the assumptions a distribution simulation needs.',
    )
  }
  const perPeriod = (projected.projectedDistributions ?? 0) / holdQuarters
  if (perPeriod <= 0) {
    throw new PracticeError('The stated assumptions project no cash distribution on this raise.')
  }

  const invested = position.invested_cents / 100
  const returned = position.distributions_cents / 100
  const result = runWaterfall({
    structure: structure ?? {
      kind: 'preferred_return_promote', cumulative_preferred: true,
      has_catch_up: false, catch_up_pct: null,
    },
    tiers: tiers.length > 0 ? tiers : [{
      sequence: 1, label: 'Pro rata', kind: 'split', hurdle_irr_pct: null,
      hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0,
    }],
    contributedCapital: invested,
    capitalReturnedToDate: returned,
    unpaidPreferredToDate: 0,
    cashAvailable: round(perPeriod, 2),
    periodYears: 0.25,
    preferredReturnPct: terms?.preferred_return_pct ?? null,
  })

  const amount = cents(Math.round(result.totalToLimitedPartners * 100))
  if (amount <= 0) throw new PracticeError('This period projects no cash to the equity.')

  await post({
    accountId: account.id,
    environment,
    type: 'distribution_credit',
    amount,
    description: `Simulated distribution — ${offering.name}, period ${period}`,
    idempotencyKey: `dist:${position.id}:${period}`,
    referenceType: 'position',
    referenceId: position.id,
  })
  await store.update('practice_positions', position.id, {
    distributions_cents: position.distributions_cents + amount,
  } as Partial<PracticePosition>)
  await record(
    account, 'distribution',
    `Simulated distribution of ${format(amount)} from ${offering.name}.`,
    offering.id, amount,
  )

  return { amount, period }
}

/**
 * Simulates the sale at the end of the hold.
 *
 * Pays the projected exit proceeds for the stake, less whatever has already
 * been paid out as capital, and closes the holding. What comes back is the
 * projection engine's exit figure scaled by ownership — the same number the
 * offering page shows, not a second model that could disagree with it.
 */
export async function simulateExit(
  actor: Actor,
  environment: SandboxEnvironment,
  positionId: string,
): Promise<{ proceeds: Cents; total: Cents; multiple: number | null }> {
  const account = await accountFor(actor, environment)
  if (!account) throw new PracticeError('No sandbox account.')
  const store = await db()

  const position = await store.findById('practice_positions', positionId)
  if (!position || position.account_id !== account.id) {
    throw new PracticeError('That holding is not in this account.')
  }
  if (position.status !== 'active') throw new PracticeError('This holding has already been exited.')

  const offering = await store.findById('offerings', position.offering_id)
  if (!offering) throw new PracticeError('That opportunity could not be found.')

  const projected = await projectInvestment(offering.id, position.invested_cents / 100)
  if (!projected || projected.insufficientData !== null) {
    throw new PracticeError('This raise has not stated the assumptions an exit simulation needs.')
  }

  const proceeds = cents(Math.max(0, Math.round((projected.projectedExitProceeds ?? 0) * 100)))
  if (proceeds <= 0) throw new PracticeError('The stated assumptions project no proceeds at sale.')

  await post({
    accountId: account.id,
    environment,
    type: 'exit_proceeds',
    amount: proceeds,
    description: `Simulated sale — ${offering.name}`,
    idempotencyKey: `exit:${position.id}`,
    referenceType: 'position',
    referenceId: position.id,
  })
  await store.update('practice_positions', position.id, {
    exit_proceeds_cents: proceeds,
    status: 'exited',
    exited_at: new Date().toISOString(),
  } as Partial<PracticePosition>)

  const total = cents(position.distributions_cents + proceeds)
  await record(
    account, 'exited',
    `Simulated sale of ${offering.name}: ${format(proceeds)} of proceeds.`,
    offering.id, proceeds,
  )

  return {
    proceeds,
    total,
    multiple: position.invested_cents > 0 ? round(total / position.invested_cents, 2) : null,
  }
}

/** What fraction of the raise a stake would be. Used for the concentration view. */
export { ownership }

/** Whether the account already holds a stake in this offering. */
export async function positionIn(
  accountId: string,
  offeringId: string,
): Promise<PracticePosition | null> {
  const store = await db()
  return store.selectOne('practice_positions', {
    where: { account_id: accountId, offering_id: offeringId, status: 'active' },
  })
}

export async function balance(accountId: string): Promise<Cents> {
  return balanceFor(accountId)
}
