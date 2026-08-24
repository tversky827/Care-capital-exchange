'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { setVerification } from '@/services/lenders'
import { retryJob } from '@/services/jobs'
import { recordAudit } from '@/services/audit'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { LenderVerification } from '@/types'

/**
 * Administrator actions.
 *
 * Every one re-asserts administrator status server-side and writes an audit
 * entry. Suspension is reversible and never deletes data — an account that
 * transacted stays on the record.
 */

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
}

export async function setVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireAdmin()
    const status = formData.get('status') as LenderVerification
    const lender = await setVerification(
      actor,
      String(formData.get('lenderId')),
      status,
      String(formData.get('note') ?? '').trim() || undefined,
    )
    revalidatePath('/admin/lenders')
    return { success: `${lender.institution_name} is now ${status}.` }
  } catch (error) {
    return fail(error)
  }
}

export async function setUserStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireAdmin()
    const userId = String(formData.get('userId'))
    const status = formData.get('status') as 'active' | 'suspended'

    if (userId === actor.user.id) {
      return { error: 'You cannot suspend your own account.' }
    }

    const store = await db()
    const user = await store.findById('users', userId)
    if (!user) return { error: 'User not found.' }

    await store.update('users', userId, { status })
    await recordAudit({
      actor,
      action: status === 'suspended' ? 'admin.user_suspended' : 'admin.user_reinstated',
      entityType: 'user',
      entityId: userId,
      summary: `${actor.user.full_name} ${status === 'suspended' ? 'suspended' : 'reinstated'} ${user.full_name}.`,
      metadata: { reason: String(formData.get('reason') ?? '') || null },
    })
    revalidatePath('/admin/users')
    return { success: `${user.full_name} is now ${status}.` }
  } catch (error) {
    return fail(error)
  }
}

export async function setCompanyStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireAdmin()
    const companyId = String(formData.get('companyId'))
    const status = formData.get('status') as 'active' | 'suspended'

    if (companyId === actor.company.id) return { error: 'You cannot suspend your own organisation.' }

    const store = await db()
    const company = await store.findById('companies', companyId)
    if (!company) return { error: 'Organisation not found.' }

    await store.update('companies', companyId, { status })
    await recordAudit({
      actor,
      action: status === 'suspended' ? 'admin.company_suspended' : 'admin.company_reinstated',
      entityType: 'company',
      entityId: companyId,
      summary: `${actor.user.full_name} ${status === 'suspended' ? 'suspended' : 'reinstated'} ${company.name}.`,
    })
    revalidatePath('/admin/users')
    return { success: `${company.name} is now ${status}.` }
  } catch (error) {
    return fail(error)
  }
}

export async function retryJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireAdmin()
    const jobId = String(formData.get('jobId'))
    const job = await retryJob(jobId)
    await recordAudit({
      actor, action: 'admin.job_retried', entityType: 'job', entityId: jobId,
      summary: `${actor.user.full_name} retried job ${job?.kind ?? jobId}.`,
    })
    revalidatePath('/admin/jobs')
    return { success: job?.status === 'succeeded' ? 'Job completed.' : `Job is ${job?.status ?? 'unknown'}.` }
  } catch (error) {
    return fail(error)
  }
}

export async function flagAiOutputAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireAdmin()
    const runId = String(formData.get('runId'))
    const kind = String(formData.get('kind'))
    const note = String(formData.get('note') ?? '').trim()
    if (!note) return { error: 'Describe what is wrong with this output.' }

    // Flags are recorded as audit entries rather than mutating the run, so the
    // original output stays exactly as it was produced.
    await recordAudit({
      actor,
      action: 'admin.ai_output_flagged',
      entityType: kind,
      entityId: runId,
      summary: `${actor.user.full_name} flagged ${kind} ${runId}: ${note}`,
      metadata: { note, kind },
    })
    revalidatePath('/admin/ai')
    return { success: 'Flag recorded in the audit log.' }
  } catch (error) {
    return fail(error)
  }
}
