import 'server-only'
import { db } from '@/db'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { reconcile, type ReconciliationSource } from '@/lib/underwriting/reconcile'
import { recordAudit } from './audit'
import { notify } from './notifications'
import type { Actor } from '@/lib/auth/session'
import type { Discrepancy } from '@/types'

/**
 * Reconciliation runner.
 *
 * Detectors are idempotent on `detector_key`: re-running updates a finding in
 * place, closes findings whose underlying conflict has gone away, and leaves
 * resolved findings resolved unless the data reverts. That property is what
 * lets reconciliation run automatically after every document upload without
 * burying the borrower in duplicates.
 */

export interface ReconcileOutcome {
  created: number
  updated: number
  autoClosed: number
  open: number
}

export async function runReconciliation(dealId: string): Promise<ReconcileOutcome> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) return { created: 0, updated: 0, autoClosed: 0, open: 0 }

  const [extracted, documents] = await Promise.all([
    store.select('extracted_fields', { where: { deal_id: dealId } }),
    store.select('documents', { where: { deal_id: dealId } }),
  ])
  const documentNames = new Map(documents.map((d) => [d.id, d.display_name]))
  const sources: ReconciliationSource[] = extracted.map((field) => ({
    ...field,
    documentName: field.document_id ? documentNames.get(field.document_id) ?? 'Unknown document' : 'Deal record',
  }))

  const findings = reconcile({ snapshot, extracted: sources })
  const existing = await store.select('discrepancies', { where: { deal_id: dealId } })
  const byKey = new Map(existing.map((d) => [d.detector_key, d]))

  let created = 0
  let updated = 0
  const newCritical: Discrepancy[] = []

  for (const finding of findings) {
    const current = byKey.get(finding.detector_key)
    if (!current) {
      const record = await store.insert('discrepancies', {
        deal_id: dealId,
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        description: finding.description,
        ai_explanation: finding.ai_explanation,
        suggested_question: finding.suggested_question,
        document_ids: finding.document_ids,
        conflicting_values: finding.conflicting_values,
        status: 'open',
        detector_key: finding.detector_key,
      } as Omit<Discrepancy, 'id' | 'created_at' | 'updated_at'>)
      created++
      if (finding.severity === 'critical' || finding.severity === 'high') newCritical.push(record)
      continue
    }
    // A resolved finding stays resolved unless its description changed, which
    // means the underlying figures moved and it deserves a fresh look.
    if (current.status !== 'open' && current.description === finding.description) continue
    await store.update('discrepancies', current.id, {
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      ai_explanation: finding.ai_explanation,
      suggested_question: finding.suggested_question,
      document_ids: finding.document_ids,
      conflicting_values: finding.conflicting_values,
      status: current.description === finding.description ? current.status : 'open',
    })
    updated++
  }

  // Findings whose conflict no longer exists are closed automatically.
  const detected = new Set(findings.map((f) => f.detector_key))
  let autoClosed = 0
  for (const record of existing) {
    if (record.status !== 'open' || detected.has(record.detector_key)) continue
    await store.update('discrepancies', record.id, { status: 'resolved' })
    await store.insert('discrepancy_resolutions', {
      discrepancy_id: record.id,
      deal_id: dealId,
      // No user closed this one; the conflict simply stopped existing.
      resolved_by: null,
      action: 'resolve',
      resolution_note: 'Closed automatically: the underlying data no longer conflicts.',
      accepted_value: null,
    } as never)
    autoClosed++
  }

  if (newCritical.length) {
    const deal = snapshot.deal
    await notify({
      event: 'issue.detected',
      companyId: deal.company_id,
      dealId,
      title: `${newCritical.length} item${newCritical.length === 1 ? '' : 's'} need attention on ${deal.name}`,
      body: newCritical.map((d) => d.title).slice(0, 3).join('; '),
      href: `/deals/${dealId}/issues`,
    })
  }

  const open = await store.count('discrepancies', { where: { deal_id: dealId, status: 'open' } })
  return { created, updated, autoClosed, open }
}

export interface ResolveInput {
  actor: Actor
  discrepancyId: string
  action: 'resolve' | 'ignore' | 'request_clarification'
  note: string
  acceptedValue?: string | null
}

export async function resolveDiscrepancy(input: ResolveInput): Promise<Discrepancy> {
  const store = await db()
  const discrepancy = await store.findById('discrepancies', input.discrepancyId)
  if (!discrepancy) throw new Error('Discrepancy not found.')

  const status: Discrepancy['status'] =
    input.action === 'resolve' ? 'resolved' : input.action === 'ignore' ? 'ignored' : 'clarification_requested'

  const updated = await store.update('discrepancies', input.discrepancyId, { status })
  await store.insert('discrepancy_resolutions', {
    discrepancy_id: input.discrepancyId,
    deal_id: discrepancy.deal_id,
    resolved_by: input.actor.user.id,
    action: input.action,
    resolution_note: input.note,
    accepted_value: input.acceptedValue ?? null,
  } as never)

  await recordAudit({
    actor: input.actor,
    action: `discrepancy.${input.action}`,
    entityType: 'discrepancy',
    entityId: input.discrepancyId,
    dealId: discrepancy.deal_id,
    summary: `${input.actor.user.full_name} marked "${discrepancy.title}" as ${status.replace('_', ' ')}.`,
    metadata: { note: input.note, acceptedValue: input.acceptedValue ?? null },
  })

  return updated
}

export async function listDiscrepancies(dealId: string): Promise<Discrepancy[]> {
  const store = await db()
  const rows = await store.select('discrepancies', { where: { deal_id: dealId } })
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return order[a.severity] - order[b.severity]
  })
}
