import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canDistributeDeal } from '@/lib/policy'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { computeMatches, matchesForDeal } from './matching'
import { readinessFor } from './underwriting'
import { transitionDeal } from './deals'
import { anonymizedLabel } from '@/lib/deal/display'
import type { Actor } from '@/lib/auth/session'
import type { DealDistribution, DistributionScope, Lender, PipelineStage } from '@/types'

/**
 * Deal distribution.
 *
 * Distribution is the moment a private deal becomes visible to outside
 * parties, so it is deliberately explicit: the borrower is shown exactly which
 * institutions will receive the package, must confirm, and the whole action is
 * audited with the recipient list attached.
 *
 * A deal that is not ready cannot be distributed without an administrator
 * override, and an override is recorded as such.
 */

export interface DistributionPreview {
  lenders: { lender: Lender; matchId: string | null; score: number; band: string; alreadySent: boolean }[]
  readinessScore: number
  canDistribute: boolean
  blockingReason: string | null
}

export async function previewDistribution(dealId: string): Promise<DistributionPreview> {
  const store = await db()
  const [matches, existing, readiness] = await Promise.all([
    matchesForDeal(dealId),
    store.select('deal_distributions', { where: { deal_id: dealId } }),
    readinessFor(dealId),
  ])
  const sent = new Set(existing.filter((d) => d.status !== 'revoked').map((d) => d.lender_id))

  return {
    lenders: matches.map(({ match, lender }) => ({
      lender,
      matchId: match.id,
      score: match.score,
      band: match.band,
      alreadySent: sent.has(lender.id),
    })),
    readinessScore: readiness?.overall ?? 0,
    canDistribute: readiness?.canDistribute ?? false,
    blockingReason: readiness?.blockingReason ?? null,
  }
}

export interface DistributeInput {
  actor: Actor
  dealId: string
  scope: DistributionScope
  lenderIds: string[]
  /** Administrator override of the readiness gate. Recorded in the audit log. */
  overrideReadiness?: boolean
  message?: string | null
}

export interface DistributeResult {
  distributions: DealDistribution[]
  skipped: string[]
}

export async function distributeDeal(input: DistributeInput): Promise<DistributeResult> {
  const store = await db()
  const deal = await store.findById('deals', input.dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canDistributeDeal(subjectOf(input.actor), deal), 'You cannot distribute this deal.')

  const readiness = await readinessFor(input.dealId)
  if (readiness && !readiness.canDistribute) {
    if (!input.overrideReadiness) {
      throw new Error(readiness.blockingReason ?? 'This deal is not ready for distribution.')
    }
    if (!input.actor.isAdmin) {
      throw new Error('Only an administrator can override the deal readiness requirement.')
    }
  }

  // Matches may be stale if the borrower edited the deal since the last run.
  await computeMatches(input.dealId, { explain: false })

  const matches = await matchesForDeal(input.dealId, true)
  const facility = await store.selectOne('facilities', { where: { deal_id: input.dealId } })
  const lenders = await store.select('lenders', { where: { id: { in: input.lenderIds } } })
  const existing = await store.select('deal_distributions', { where: { deal_id: input.dealId } })
  const byLender = new Map(existing.map((d) => [d.lender_id, d]))

  const created: DealDistribution[] = []
  const skipped: string[] = []

  for (const lenderId of input.lenderIds) {
    const lender = lenders.find((l) => l.id === lenderId)
    if (!lender) {
      skipped.push(lenderId)
      continue
    }
    // Unverified lenders never receive a package, whatever the borrower selects.
    if (lender.verification_status !== 'verified') {
      skipped.push(lender.institution_name)
      continue
    }

    const match = matches.find((m) => m.lender.id === lenderId)
    const current = byLender.get(lenderId)
    if (current && current.status !== 'revoked') {
      created.push(current)
      continue
    }

    const record = current
      ? await store.update('deal_distributions', current.id, {
          status: 'sent',
          scope: input.scope,
          pipeline_stage: 'new_match' as PipelineStage,
          distributed_by: input.actor.user.id,
        })
      : await store.insert('deal_distributions', {
          deal_id: input.dealId,
          lender_id: lenderId,
          match_id: match?.match.id ?? null,
          distributed_by: input.actor.user.id,
          scope: input.scope,
          status: 'sent',
          pipeline_stage: 'new_match',
          first_viewed_at: null,
          last_viewed_at: null,
          view_count: 0,
          passed_reason: null,
        } as Omit<DealDistribution, 'id' | 'created_at' | 'updated_at'>)
    created.push(record)

    await notify({
      event: 'deal.distributed',
      companyId: lender.company_id,
      dealId: input.dealId,
      title: `New opportunity: ${deal.anonymize_in_marketplace ? anonymizedLabel(deal, facility) : deal.name}`,
      body:
        input.message ??
        `A ${deal.transaction_type.replace(/_/g, ' ')} financing opportunity matching your stated criteria has been shared with you${match ? ` (${match.match.score}% fit)` : ''}.`,
      href: `/lender/deals/${input.dealId}`,
    })
  }

  await store.update('deals', input.dealId, {
    distribution_scope: input.scope,
    distributed_at: deal.distributed_at ?? new Date().toISOString(),
  })

  if (deal.status === 'ready_for_distribution' || deal.status === 'underwriting' || deal.status === 'needs_attention') {
    await transitionDeal(input.actor, input.dealId, 'distributed', `Shared with ${created.length} lenders.`)
  }

  await recordAudit({
    actor: input.actor,
    action: 'deal.distributed',
    entityType: 'deal',
    entityId: input.dealId,
    dealId: input.dealId,
    summary: `${input.actor.user.full_name} distributed ${deal.reference} to ${created.length} lender${created.length === 1 ? '' : 's'}.`,
    metadata: {
      scope: input.scope,
      lenders: lenders.map((l) => ({ id: l.id, name: l.institution_name })),
      skipped,
      readinessScore: readiness?.overall ?? null,
      overrideUsed: Boolean(input.overrideReadiness && readiness && !readiness.canDistribute),
    },
  })

  return { distributions: created, skipped }
}

export async function revokeDistribution(actor: Actor, distributionId: string, reason: string): Promise<void> {
  const store = await db()
  const distribution = await store.findById('deal_distributions', distributionId)
  if (!distribution) throw new Error('Distribution not found.')
  const deal = await store.findById('deals', distribution.deal_id)
  if (!deal) throw new Error('Deal not found.')
  authorize(canDistributeDeal(subjectOf(actor), deal), 'You cannot change distribution for this deal.')

  await store.update('deal_distributions', distributionId, { status: 'revoked', passed_reason: reason })
  await recordAudit({
    actor,
    action: 'deal.distribution_revoked',
    entityType: 'deal_distribution',
    entityId: distributionId,
    dealId: distribution.deal_id,
    summary: `${actor.user.full_name} revoked lender access to ${deal.reference}.`,
    metadata: { lenderId: distribution.lender_id, reason },
  })
}

/** Records a lender opening a deal, for the borrower's engagement view. */
export async function recordLenderView(dealId: string, lenderId: string): Promise<void> {
  const store = await db()
  const distribution = await store.selectOne('deal_distributions', {
    where: { deal_id: dealId, lender_id: lenderId },
  })
  if (!distribution || distribution.status === 'revoked') return

  const now = new Date().toISOString()
  const first = distribution.first_viewed_at === null
  await store.update('deal_distributions', distribution.id, {
    status: distribution.status === 'sent' ? 'viewed' : distribution.status,
    first_viewed_at: distribution.first_viewed_at ?? now,
    last_viewed_at: now,
    view_count: distribution.view_count + 1,
    pipeline_stage: distribution.pipeline_stage === 'new_match' ? 'reviewing' : distribution.pipeline_stage,
  })

  if (first) {
    const [deal, lender] = await Promise.all([
      store.findById('deals', dealId),
      store.findById('lenders', lenderId),
    ])
    if (deal && lender) {
      await notify({
        event: 'lender.viewed_deal',
        companyId: deal.company_id,
        dealId,
        title: `${lender.institution_name} opened your deal`,
        body: `${lender.institution_name} reviewed the financing package for ${deal.name}.`,
        href: `/deals/${dealId}/matches`,
      })
    }
  }
}

export async function updatePipelineStage(
  actor: Actor,
  distributionId: string,
  stage: PipelineStage,
  reason?: string,
): Promise<DealDistribution> {
  const store = await db()
  const distribution = await store.findById('deal_distributions', distributionId)
  if (!distribution) throw new Error('Distribution not found.')
  authorize(
    actor.isAdmin || (actor.lender?.id === distribution.lender_id && actor.canWrite),
    'You cannot change this pipeline entry.',
  )

  const updated = await store.update('deal_distributions', distributionId, {
    pipeline_stage: stage,
    status: stage === 'passed' ? 'passed' : distribution.status === 'sent' ? 'viewed' : 'engaged',
    passed_reason: stage === 'passed' ? reason ?? null : distribution.passed_reason,
  })

  await recordAudit({
    actor,
    action: 'pipeline.stage_changed',
    entityType: 'deal_distribution',
    entityId: distributionId,
    dealId: distribution.deal_id,
    summary: `${actor.lender?.institution_name ?? actor.company.name} moved the deal to ${stage.replace(/_/g, ' ')}.`,
    metadata: { from: distribution.pipeline_stage, to: stage, reason: reason ?? null },
  })

  if (stage === 'passed') {
    const deal = await store.findById('deals', distribution.deal_id)
    if (deal) {
      await notify({
        event: 'deal.status_changed',
        companyId: deal.company_id,
        dealId: deal.id,
        title: `${actor.lender?.institution_name ?? 'A lender'} passed on ${deal.name}`,
        body: reason ?? 'No reason was provided.',
        href: `/deals/${deal.id}/matches`,
      })
    }
  }

  return updated
}

export async function distributionsForDeal(dealId: string): Promise<DealDistribution[]> {
  const store = await db()
  return store.select('deal_distributions', { where: { deal_id: dealId } })
}

export async function pipelineForLender(lenderId: string): Promise<DealDistribution[]> {
  const store = await db()
  return store.select('deal_distributions', {
    where: { lender_id: lenderId },
    orderBy: { field: 'updated_at', dir: 'desc' },
  })
}
