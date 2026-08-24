'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { authorize, canManageCompany, ForbiddenError } from '@/lib/policy'
import { recordAudit } from '@/services/audit'
import { hashPassword, verifyPassword, checkPasswordStrength } from '@/lib/auth/password'
import type { ActionState } from '@/app/(app)/deals/actions'

function fail(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { error: error.message }
  return { error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const store = await db()
    await store.update('users', actor.user.id, {
      full_name: String(formData.get('full_name') ?? '').trim() || actor.user.full_name,
      title: String(formData.get('title') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
    })
    await recordAudit({
      actor, action: 'user.profile_updated', entityType: 'user', entityId: actor.user.id,
      summary: `${actor.user.full_name} updated their profile.`,
    })
    revalidatePath('/settings')
    return { success: 'Profile saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updateNotificationPreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const store = await db()
    await store.update('users', actor.user.id, {
      notification_preferences: {
        in_app: true,
        email: formData.get('email') === 'yes',
        sms: false,
        muted_events: formData.getAll('muted_events').map(String),
      },
    })
    revalidatePath('/settings')
    return { success: 'Notification preferences saved.' }
  } catch (error) {
    return fail(error)
  }
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    const current = String(formData.get('current_password') ?? '')
    const next = String(formData.get('new_password') ?? '')

    if (!(await verifyPassword(current, actor.user.password_hash))) {
      return { error: 'Your current password is not correct.' }
    }
    const strength = checkPasswordStrength(next)
    if (!strength.ok) return { error: strength.message! }

    const store = await db()
    await store.update('users', actor.user.id, { password_hash: await hashPassword(next) })
    await recordAudit({
      actor, action: 'user.password_changed', entityType: 'user', entityId: actor.user.id,
      summary: `${actor.user.full_name} changed their password.`,
    })
    return { success: 'Password changed.' }
  } catch (error) {
    return fail(error)
  }
}

export async function updateCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor()
    authorize(canManageCompany(subjectOf(actor), actor.company.id), 'Only an owner or administrator can edit the organisation.')

    const store = await db()
    await store.update('companies', actor.company.id, {
      name: String(formData.get('name') ?? '').trim() || actor.company.name,
      website: String(formData.get('website') ?? '').trim() || null,
      description: String(formData.get('description') ?? '').trim() || null,
      address_line1: String(formData.get('address_line1') ?? '').trim() || null,
      city: String(formData.get('city') ?? '').trim() || null,
      state: String(formData.get('state') ?? '').trim().toUpperCase() || null,
      zip: String(formData.get('zip') ?? '').trim() || null,
    })
    await recordAudit({
      actor, action: 'company.updated', entityType: 'company', entityId: actor.company.id,
      summary: `${actor.user.full_name} updated ${actor.company.name}.`,
    })
    revalidatePath('/settings')
    return { success: 'Organisation saved.' }
  } catch (error) {
    return fail(error)
  }
}
