import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { round } from '@/lib/finance/calculations'
import { runWaterfall } from '@/lib/equity/waterfall'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import { requireOffering } from './offerings'
import type { Actor } from '@/lib/auth/session'
import type {
  DistributionEvent, DistributionKind, InvestmentDistribution, InvestmentPosition,
} from '@/types/equity'

/**
 * Distributions.
 *
 * A distribution moves through states — scheduled, calculated, approved,
 * processed — and the platform performs only the first three. It computes what
 * each investor is owed and records that a sponsor approved it; it does not
 * move money, and nothing in this file pretends otherwise.
 *
 * The allocation itself runs through the waterfall engine, which is tested
 * separately. No language model participates in deciding what anyone is paid.
 */

export async function scheduleDistribution(
  actor: Actor,
  offeringId: string,
  input: {
    kind: DistributionKind
    periodLabel: string
    totalAmount: number
    scheduledFor?: string | null
    notes?: string | null
  },
): Promise<DistributionEvent> {
  authorize(isAvailable('DISTRIBUTIONS_ENABLED'), 'Distributions are not enabled for this deployment.')
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can schedule a distribution.',
  )

  const event = await store.insert('distribution_events', {
    offering_id: offeringId,
    deal_id: offering.deal_id,
    kind: input.kind,
    period_label: input.periodLabel,
    total_amount: input.totalAmount,
    status: 'scheduled',
    scheduled_for: input.scheduledFor ?? null,
    approved_by: null,
    approved_at: null,
    processed_at: null,
    failure_reason: null,
    notes: input.notes ?? null,
  } as Omit<DistributionEvent, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'distribution.scheduled', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id,
    summary: `${input.periodLabel} distribution of ${money(input.totalAmount)} scheduled.`,
  })
  return event
}

/**
 * Allocates a distribution across investors through the waterfall.
 *
 * Runs the waterfall once at the offering level to split the cash between the
 * limited partners and the sponsor, then divides the limited partners' share
 * pro rata by contributed capital. Recomputing overwrites a previous
 * calculation — which is safe, because nothing is paid until approval.
 */
export async function calculateDistribution(
  actor: Actor,
  eventId: string,
): Promise<InvestmentDistribution[]> {
  const store = await db()
  const event = await store.findById('distribution_events', eventId)
  if (!event) throw new Error('Distribution not found.')
  const offering = await requireOffering(event.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can calculate a distribution.',
  )
  authorize(event.status !== 'processed', 'This distribution has already been processed.')

  const [structure, positions, priorEvents] = await Promise.all([
    store.selectOne('waterfall_structures', { where: { offering_id: offering.id } }),
    store.select('investment_positions', { where: { offering_id: offering.id, status: 'active' } }),
    store.select('distribution_events', { where: { offering_id: offering.id } }),
  ])
  if (positions.length === 0) return []

  const tiers = structure
    ? await store.select('waterfall_tiers', {
      where: { waterfall_id: structure.id }, orderBy: { field: 'sequence' },
    })
    : []

  const terms = await store.selectOne('offering_terms', { where: { offering_id: offering.id } })
  const contributed = round(positions.reduce((sum, p) => sum + p.invested_amount, 0), 2)
  const returnedToDate = round(positions.reduce((sum, p) => sum + p.distributions_received, 0), 2)

  // Everything already processed tells the waterfall where it is starting from.
  const processedEvents = priorEvents.filter((e) => e.status === 'processed' && e.id !== eventId)
  const periodYears = periodLengthYears(terms?.distribution_frequency ?? 'quarterly')

  const result = runWaterfall({
    structure: structure ?? {
      kind: 'straight_pro_rata', cumulative_preferred: false, has_catch_up: false, catch_up_pct: null,
    },
    tiers: tiers.length > 0 ? tiers : [{
      sequence: 1, label: 'Pro rata', kind: 'split', hurdle_irr_pct: null,
      hurdle_multiple: null, lp_share_pct: 1, sponsor_share_pct: 0,
    }],
    contributedCapital: contributed,
    capitalReturnedToDate: returnedToDate,
    unpaidPreferredToDate: 0,
    cashAvailable: event.total_amount,
    periodYears: processedEvents.length === 0 ? periodYears : periodYears,
    preferredReturnPct: terms?.preferred_return_pct ?? null,
  })

  // Clear any earlier calculation for this event before writing a new one.
  const existing = await store.select('investment_distributions', {
    where: { distribution_event_id: eventId },
  })
  for (const row of existing) await store.remove('investment_distributions', row.id)

  const written: InvestmentDistribution[] = []
  for (const position of positions) {
    const share = contributed > 0 ? position.invested_amount / contributed : 0
    const amount = round(result.totalToLimitedPartners * share, 2)
    written.push(await store.insert('investment_distributions', {
      distribution_event_id: eventId,
      position_id: position.id,
      investor_id: position.investor_id,
      offering_id: offering.id,
      amount,
      return_of_capital: round(result.returnOfCapital * share, 2),
      preferred_return: round(result.preferredReturn * share, 2),
      profit_share: round(result.profitShare * share, 2),
      status: 'calculated',
      processed_at: null,
    } as Omit<InvestmentDistribution, 'id' | 'created_at' | 'updated_at'>))
  }

  await store.update('distribution_events', eventId, { status: 'calculated' } as Partial<DistributionEvent>)
  await recordAudit({
    actor, action: 'distribution.calculated', entityType: 'offering', entityId: offering.id,
    dealId: offering.deal_id,
    summary: `${event.period_label}: ${money(result.totalToLimitedPartners)} allocated across ${positions.length} investors.`,
  })
  return written
}

/**
 * Approves and records a distribution as processed.
 *
 * "Processed" means the sponsor has recorded that it was paid, not that this
 * platform paid it. Money movement belongs to whoever holds the accounts.
 */
export async function approveDistribution(actor: Actor, eventId: string): Promise<DistributionEvent> {
  const store = await db()
  const event = await store.findById('distribution_events', eventId)
  if (!event) throw new Error('Distribution not found.')
  const offering = await requireOffering(event.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can approve a distribution.',
  )
  authorize(event.status === 'calculated', 'Calculate the distribution before approving it.')

  const now = new Date().toISOString()
  const updated = await store.update('distribution_events', eventId, {
    status: 'processed', approved_by: actor.user.id, approved_at: now, processed_at: now,
  } as Partial<DistributionEvent>)

  const allocations = await store.select('investment_distributions', {
    where: { distribution_event_id: eventId },
  })
  for (const allocation of allocations) {
    await store.update('investment_distributions', allocation.id, {
      status: 'processed', processed_at: now,
    } as Partial<InvestmentDistribution>)

    const position = await store.findById('investment_positions', allocation.position_id)
    if (position) {
      await store.update('investment_positions', position.id, {
        distributions_received: round(position.distributions_received + allocation.amount, 2),
      } as Partial<InvestmentPosition>)
    }

    const profile = await store.findById('investor_profiles', allocation.investor_id)
    if (profile) {
      await notify({
        event: 'distribution.posted',
        companyId: profile.company_id,
        title: `Distribution posted for ${offering.name}`,
        body: `${money(allocation.amount)} was distributed for ${event.period_label}.`,
        href: '/investor/portfolio',
        dealId: offering.deal_id,
      })
    }
  }

  await recordAudit({
    actor, action: 'distribution.processed', entityType: 'offering', entityId: offering.id,
    dealId: offering.deal_id,
    summary: `${event.period_label} distribution of ${money(event.total_amount)} recorded as processed.`,
  })
  return updated
}

/** Everything an investor has been paid, newest first. */
export async function distributionsForInvestor(investorId: string): Promise<InvestmentDistribution[]> {
  const store = await db()
  return store.select('investment_distributions', {
    where: { investor_id: investorId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}

function periodLengthYears(frequency: string): number {
  switch (frequency) {
    case 'monthly': return 1 / 12
    case 'quarterly': return 0.25
    case 'semiannual': return 0.5
    case 'annual': return 1
    default: return 0.25
  }
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
