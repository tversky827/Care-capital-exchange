import 'server-only'
import { db } from '@/db'
import type { Actor } from '@/lib/auth/session'
import { log } from '@/lib/observability'
import type { AuditLog } from '@/types'

/**
 * Audit logging.
 *
 * `audit_logs` is append-only at the store layer and, under Supabase, has no
 * UPDATE or DELETE policy for any role but the service role — so a normal user
 * cannot rewrite history even through PostgREST.
 *
 * Logging never throws into the caller: an audit failure must not roll back the
 * user's action, but it is reported to the server log so it cannot pass
 * unnoticed.
 */

export interface AuditInput {
  actor: Actor | null
  action: string
  entityType: string
  entityId?: string | null
  dealId?: string | null
  summary: string
  metadata?: Record<string, unknown>
  ip?: string | null
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const store = await db()
    await store.insert('audit_logs', {
      actor_id: input.actor?.user.id ?? null,
      actor_company_id: input.actor?.company.id ?? null,
      deal_id: input.dealId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
    } as Omit<AuditLog, 'id' | 'created_at'>)
  } catch (error) {
    log.error('audit write failed', error, { action: input.action, entityType: input.entityType })
  }
}

export async function auditForDeal(dealId: string, limit = 200): Promise<AuditLog[]> {
  const store = await db()
  return store.select('audit_logs', {
    where: { deal_id: dealId },
    orderBy: { field: 'created_at', dir: 'desc' },
    limit,
  })
}

export async function auditForCompany(companyId: string, limit = 200): Promise<AuditLog[]> {
  const store = await db()
  return store.select('audit_logs', {
    where: { actor_company_id: companyId },
    orderBy: { field: 'created_at', dir: 'desc' },
    limit,
  })
}
