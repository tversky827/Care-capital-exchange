import 'server-only'
import { db } from '@/db'
import { generateMemo } from '@/lib/ai/local/memo'
import { runAi } from '@/lib/ai/provider'
import { creditMemoSchema } from '@/lib/ai/schemas'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { scoreDeal } from '@/lib/underwriting/score'
import { recordAiUsage } from './ai-usage'
import { recordAudit } from './audit'
import { latestRun, runUnderwriting } from './underwriting'
import type { Actor } from '@/lib/auth/session'
import type { CreditMemo, CreditMemoVersion, MemoSection } from '@/types'

/**
 * Credit memo generation and versioning.
 *
 * Every generation produces a new immutable version rather than mutating the
 * last one, so a lender who received version 3 can be shown exactly what they
 * received even after the borrower regenerates.
 */

export interface MemoResult {
  memo: CreditMemo
  version: CreditMemoVersion
}

export async function generateCreditMemo(dealId: string, actor: Actor): Promise<MemoResult> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) throw new Error('Deal not found.')

  // A memo without an analysis behind it is just a formatted spreadsheet.
  let run = await latestRun(dealId)
  if (!run?.analysis) {
    run = (await runUnderwriting(dealId, { actor })).run
  }
  const analysis = run.analysis
  if (!analysis) throw new Error('Underwriting analysis is not available for this deal.')

  const [extracted, documents] = await Promise.all([
    store.select('extracted_fields', { where: { deal_id: dealId } }),
    store.select('documents', { where: { deal_id: dealId, deleted_at: { isNull: true } } }),
  ])
  const score = scoreDeal(snapshot)

  const result = await runAi({
    task: 'memo',
    instruction:
      'Write a lender-facing credit memorandum from the supplied deal record. Use only figures present in the context; every financial statement must be traceable to a supplied value. Do not state or imply a credit decision, an approval, or a commitment to lend.',
    schema: creditMemoSchema,
    schemaName: 'CreditMemo',
    schemaHint: '{ sections: [{ key, title, body, citations: [{marker, label, document_id, page, value}] }] }',
    context: {
      deal: snapshot.deal,
      facility: snapshot.facility,
      terms: snapshot.terms,
      sponsor: snapshot.sponsor,
      metrics: snapshot.metrics,
      computed: snapshot.summary,
      periods: snapshot.periods.map((p) => ({ label: p.period.label, items: p.items })),
      analysis,
      score,
    },
    local: () => generateMemo({ snapshot, analysis, score, extracted, documents }),
  })

  await recordAiUsage({
    dealId,
    task: 'memo',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  let memo = await store.selectOne('credit_memos', { where: { deal_id: dealId } })
  if (!memo) {
    memo = await store.insert('credit_memos', {
      deal_id: dealId,
      current_version: 0,
      status: 'draft',
      created_by: actor.user.id,
    } as Omit<CreditMemo, 'id' | 'created_at' | 'updated_at'>)
  }

  const nextVersion = memo.current_version + 1
  const version = await store.insert('credit_memo_versions', {
    memo_id: memo.id,
    deal_id: dealId,
    version: nextVersion,
    sections: result.data.sections as MemoSection[],
    generated_by: actor.user.id,
    generator: 'ai',
    underwriting_run_id: run.id,
    notes: result.fallbackReason,
  } as Omit<CreditMemoVersion, 'id' | 'created_at'>)

  memo = await store.update('credit_memos', memo.id, { current_version: nextVersion })

  await recordAudit({
    actor,
    action: 'memo.generated',
    entityType: 'credit_memo',
    entityId: memo.id,
    dealId,
    summary: `${actor.user.full_name} generated version ${nextVersion} of the credit memo.`,
    metadata: { version: nextVersion, provider: result.provider, sections: result.data.sections.length },
  })

  // A completed memo can be the last thing standing between a deal and being
  // distributable, so re-evaluate the status here.
  const { advanceDealStatus } = await import('./deals')
  await advanceDealStatus(dealId, actor)

  return { memo, version }
}

/** Saves a human edit as a new version, preserving the AI-generated original. */
export async function saveMemoEdit(
  dealId: string,
  actor: Actor,
  sections: MemoSection[],
  notes?: string,
): Promise<MemoResult> {
  const store = await db()
  const memo = await store.selectOne('credit_memos', { where: { deal_id: dealId } })
  if (!memo) throw new Error('No credit memo exists for this deal yet.')

  const nextVersion = memo.current_version + 1
  const version = await store.insert('credit_memo_versions', {
    memo_id: memo.id,
    deal_id: dealId,
    version: nextVersion,
    sections,
    generated_by: actor.user.id,
    generator: 'human_edit',
    underwriting_run_id: null,
    notes: notes ?? null,
  } as Omit<CreditMemoVersion, 'id' | 'created_at'>)

  const updated = await store.update('credit_memos', memo.id, { current_version: nextVersion })

  await recordAudit({
    actor,
    action: 'memo.edited',
    entityType: 'credit_memo',
    entityId: memo.id,
    dealId,
    summary: `${actor.user.full_name} saved edits as version ${nextVersion} of the credit memo.`,
    metadata: { version: nextVersion },
  })

  return { memo: updated, version }
}

export async function currentMemo(
  dealId: string,
): Promise<{ memo: CreditMemo; version: CreditMemoVersion } | null> {
  const store = await db()
  const memo = await store.selectOne('credit_memos', { where: { deal_id: dealId } })
  if (!memo) return null
  const version = await store.selectOne('credit_memo_versions', {
    where: { memo_id: memo.id, version: memo.current_version },
  })
  return version ? { memo, version } : null
}

export async function memoVersions(dealId: string): Promise<CreditMemoVersion[]> {
  const store = await db()
  return store.select('credit_memo_versions', {
    where: { deal_id: dealId },
    orderBy: { field: 'version', dir: 'desc' },
  })
}
