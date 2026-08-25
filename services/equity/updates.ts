import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { runAi } from '@/lib/ai/provider'
import { investorUpdateSchema } from '@/lib/ai/schemas'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { recordAiUsage } from '../ai-usage'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import { requireOffering } from './offerings'
import type { Actor } from '@/lib/auth/session'
import type { InvestorUpdate, InvestorUpdateMetrics } from '@/types/equity'

/**
 * Quarterly investor reporting.
 *
 * The sponsor supplies the period's actual figures; the analyst drafts the
 * narrative around them; a human approves before any investor sees it. The
 * approval step is not ceremony — an update is the sponsor speaking to their
 * investors, and the platform must never put words in their mouth unread.
 *
 * Every figure in an update is an actual. Nothing here projects anything.
 */

export async function draftUpdate(
  actor: Actor,
  offeringId: string,
  input: { periodLabel: string; metrics: InvestorUpdateMetrics; notes?: string | null },
): Promise<InvestorUpdate> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can report on this offering.',
  )

  const snapshot = await buildSnapshot(offering.deal_id)
  const previous = await store.select('investor_updates', {
    where: { offering_id: offeringId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })

  const result = await runAi({
    task: 'memo',
    instruction:
      'Draft a quarterly update from a sponsor to the investors in this offering, using only the supplied figures. Report what happened; do not forecast, do not reassure, and do not restate any figure differently from the way it is supplied. Where a figure moved, say what moved it only if the supplied notes say so.',
    schema: investorUpdateSchema,
    schemaName: 'InvestorUpdate',
    schemaHint: '{ title, body, highlights[] }',
    context: {
      offering: { name: offering.name, reference: offering.reference },
      period: input.periodLabel,
      metrics: input.metrics,
      sponsorNotes: input.notes ?? null,
      priorPeriod: previous[0]?.metrics ?? null,
      facility: snapshot?.facility ?? null,
    },
    local: () => localDraft(offering.name, input.periodLabel, input.metrics, previous[0]?.metrics ?? null, input.notes ?? null),
  })

  await recordAiUsage({
    dealId: offering.deal_id,
    task: 'memo',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  const update = await store.insert('investor_updates', {
    offering_id: offeringId,
    deal_id: offering.deal_id,
    period_label: input.periodLabel,
    title: result.data.title,
    body: result.data.body,
    generator: 'ai',
    // Drafted, never published: a human decides what their investors read.
    status: 'draft',
    metrics: input.metrics,
    approved_by: null,
    approved_at: null,
    published_at: null,
    created_by: actor.user.id,
  } as Omit<InvestorUpdate, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investor_update.drafted', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `${input.periodLabel} investor update drafted for review.`,
  })
  return update
}

/** Edits a draft before it goes out. */
export async function editUpdate(
  actor: Actor,
  updateId: string,
  patch: { title?: string; body?: string },
): Promise<InvestorUpdate> {
  const store = await db()
  const update = await store.findById('investor_updates', updateId)
  if (!update) throw new Error('Update not found.')
  const offering = await requireOffering(update.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can edit this update.',
  )
  authorize(update.status !== 'published', 'A published update cannot be rewritten.')

  return store.update('investor_updates', updateId, {
    ...patch,
    // An edited draft is the sponsor's words, and is attributed as such.
    generator: 'human',
  } as Partial<InvestorUpdate>)
}

/** Publishes an update to the offering's investors. */
export async function publishUpdate(actor: Actor, updateId: string): Promise<InvestorUpdate> {
  const store = await db()
  const update = await store.findById('investor_updates', updateId)
  if (!update) throw new Error('Update not found.')
  const offering = await requireOffering(update.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can publish this update.',
  )
  authorize(update.status !== 'published', 'This update has already been published.')

  const now = new Date().toISOString()
  const published = await store.update('investor_updates', updateId, {
    status: 'published', approved_by: actor.user.id, approved_at: now, published_at: now,
  } as Partial<InvestorUpdate>)

  const positions = await store.select('investment_positions', {
    where: { offering_id: offering.id, status: 'active' },
  })
  for (const position of positions) {
    const profile = await store.findById('investor_profiles', position.investor_id)
    if (!profile) continue
    await notify({
      event: 'investor.update_published',
      companyId: profile.company_id,
      title: `${offering.name}: ${update.period_label} update`,
      body: update.title,
      href: '/investor/portfolio',
      dealId: offering.deal_id,
    })
  }

  await recordAudit({
    actor, action: 'investor_update.published', entityType: 'offering', entityId: offering.id,
    dealId: offering.deal_id,
    summary: `${update.period_label} update published to ${positions.length} investors.`,
  })
  return published
}

/** Published updates for the offerings an investor actually holds. */
export async function updatesForInvestor(investorId: string): Promise<InvestorUpdate[]> {
  const store = await db()
  const positions = await store.select('investment_positions', { where: { investor_id: investorId } })
  const updates: InvestorUpdate[] = []
  for (const position of positions) {
    const published = await store.select('investor_updates', {
      where: { offering_id: position.offering_id, status: 'published' },
      orderBy: { field: 'published_at', dir: 'desc' },
    })
    updates.push(...published)
  }
  return updates.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
}

export async function updatesForOffering(actor: Actor, offeringId: string): Promise<InvestorUpdate[]> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  const isSponsor = offering.company_id === actor.company.id || actor.isAdmin
  const updates = await store.select('investor_updates', {
    where: { offering_id: offeringId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
  // Drafts belong to the sponsor until they choose to publish them.
  return isSponsor ? updates : updates.filter((update) => update.status === 'published')
}

/**
 * The deterministic draft.
 *
 * Reports movement between periods and says nothing about why unless the
 * sponsor's own notes say. A report that invented causes would be worse than
 * one that only reports numbers.
 */
function localDraft(
  offeringName: string,
  period: string,
  metrics: InvestorUpdateMetrics,
  prior: InvestorUpdateMetrics | null,
  notes: string | null,
) {
  const movement = (label: string, current: number | null, previous: number | null | undefined, format: (v: number | null) => string) => {
    if (current === null) return null
    if (previous === null || previous === undefined) return `${label} was ${format(current)}.`
    const change = current - previous
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged'
    if (direction === 'unchanged') return `${label} was unchanged at ${format(current)}.`
    return `${label} was ${format(current)}, ${direction} ${format(Math.abs(change))} on the prior period.`
  }

  const money = (value: number | null) => formatCurrency(value)
  const percent = (value: number | null) => formatPercent(value)

  const lines = [
    movement('Revenue', metrics.revenue, prior?.revenue, money),
    movement('EBITDA', metrics.ebitda, prior?.ebitda, money),
    movement('Occupancy', metrics.occupancy_pct, prior?.occupancy_pct, percent),
    movement('Agency labour', metrics.agency_labor_pct, prior?.agency_labor_pct, percent),
    movement('Debt balance', metrics.debt_balance, prior?.debt_balance, money),
    metrics.capex !== null ? `Capital expenditure in the period was ${money(metrics.capex)}.` : null,
  ].filter(Boolean) as string[]

  const distribution = metrics.distribution_per_100k !== null
    ? `A distribution of ${money(metrics.distribution_per_100k)} per $100,000 invested was made for the period.`
    : 'No distribution was made for this period.'

  return {
    title: `${offeringName}: ${period}`,
    body: [
      `This is the ${period} update for investors in ${offeringName}.`,
      lines.join(' '),
      distribution,
      notes ? `From the sponsor: ${notes}` : null,
      'The figures above are actual results for the period. They are not projections, and past performance does not indicate future results.',
    ].filter(Boolean).join('\n\n'),
    highlights: lines.slice(0, 6),
  }
}
