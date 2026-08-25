import 'server-only'
import { db } from '@/db'
import { log } from '@/lib/observability'
import type { Notification } from '@/types'

/**
 * Notification engine.
 *
 * Events are declared once here with their default copy and severity, so a new
 * trigger point cannot invent inconsistent wording. Delivery is pluggable: the
 * in-app inbox always receives the notification, and the email channel is an
 * interface with a development implementation that logs rather than sends.
 */

export type NotificationEvent =
  | 'deal.created'
  | 'deal.status_changed'
  | 'document.uploaded'
  | 'document.processed'
  | 'document.failed'
  | 'analysis.complete'
  | 'issue.detected'
  | 'deal.ready'
  | 'match.found'
  | 'deal.distributed'
  | 'lender.viewed_deal'
  | 'lender.requested_information'
  | 'indication.received'
  | 'indication.updated'
  | 'indication.selected'
  | 'diligence.requested'
  | 'closing.approaching'
  | 'message.received'
  | 'lender.verified'
  // --- equity marketplace ---------------------------------------------------
  | 'offering.matched'
  | 'offering.opened'
  | 'offering.closing_soon'
  | 'offering.document_added'
  | 'investor.verification_required'
  | 'investment.status_changed'
  | 'investor.update_published'
  | 'distribution.posted'
  | 'tax_document.available'

const SEVERITY: Record<NotificationEvent, Notification['severity']> = {
  'deal.created': 'info',
  'deal.status_changed': 'info',
  'document.uploaded': 'info',
  'document.processed': 'success',
  'document.failed': 'warning',
  'analysis.complete': 'success',
  'issue.detected': 'warning',
  'deal.ready': 'success',
  'match.found': 'success',
  'deal.distributed': 'success',
  'lender.viewed_deal': 'info',
  'lender.requested_information': 'warning',
  'indication.received': 'success',
  'indication.updated': 'info',
  'indication.selected': 'success',
  'diligence.requested': 'info',
  'closing.approaching': 'warning',
  'message.received': 'info',
  'lender.verified': 'success',
  'offering.matched': 'info',
  'offering.opened': 'info',
  'offering.closing_soon': 'warning',
  'offering.document_added': 'info',
  'investor.verification_required': 'warning',
  'investment.status_changed': 'info',
  'investor.update_published': 'info',
  'distribution.posted': 'success',
  'tax_document.available': 'info',
}

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

/** Email delivery. Swap the implementation, not the call sites. */
export interface EmailTransport {
  readonly name: string
  send(message: EmailMessage): Promise<void>
}

class ConsoleEmailTransport implements EmailTransport {
  readonly name = 'console'
  async send(message: EmailMessage): Promise<void> {
    log.info('email dispatched', { transport: this.name, to: message.to, subject: message.subject })
  }
}

let transport: EmailTransport | null = null
let suppressed = false

/**
 * Resolved on first use rather than at import, so the environment is read once
 * the process is actually configured. A deployment with mail credentials gets
 * real delivery; one without falls back to logging.
 */
async function activeTransport(): Promise<EmailTransport> {
  if (!transport) {
    const { resolveTransport } = await import('./email')
    transport = resolveTransport() ?? new ConsoleEmailTransport()
  }
  return transport
}

export function setEmailTransport(next: EmailTransport): void {
  transport = next
}

/**
 * Suppresses delivery during bulk operations such as demo seeding, where the
 * events are real but notifying about each one would bury the genuine signal.
 */
export function setNotificationsSuppressed(value: boolean): void {
  suppressed = value
}

export interface NotifyInput {
  event: NotificationEvent
  title: string
  body: string
  dealId?: string | null
  href?: string | null
  /** Explicit recipients. When absent, every member of `companyId` is notified. */
  userIds?: string[]
  companyId: string
  excludeUserId?: string | null
}

export async function notify(input: NotifyInput): Promise<Notification[]> {
  if (suppressed) return []
  const store = await db()
  const recipients = input.userIds
    ? input.userIds
    : (await store.select('company_members', { where: { company_id: input.companyId } })).map((m) => m.user_id)

  const targets = [...new Set(recipients)].filter((id) => id !== input.excludeUserId)
  if (!targets.length) return []

  const users = await store.select('users', { where: { id: { in: targets } } })
  const created: Notification[] = []

  for (const user of users) {
    const preferences = user.notification_preferences
    if (preferences?.muted_events?.includes(input.event)) continue

    const notification = await store.insert('notifications', {
      user_id: user.id,
      company_id: input.companyId,
      deal_id: input.dealId ?? null,
      event: input.event,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      severity: SEVERITY[input.event],
      read_at: null,
      emailed_at: null,
    } as Omit<Notification, 'id' | 'created_at'>)
    created.push(notification)

    if (preferences?.email !== false) {
      try {
        await (await activeTransport()).send({
          to: user.email,
          subject: input.title,
          body: `${input.body}${input.href ? `\n\nOpen: ${input.href}` : ''}`,
        })
        await store.update('notifications', notification.id, { emailed_at: new Date().toISOString() })
      } catch (error) {
        log.error('email delivery failed', error, { event: input.event, transport: transport?.name })
      }
    }
  }

  return created
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const store = await db()
  return store.select('notifications', {
    where: { user_id: userId },
    orderBy: { field: 'created_at', dir: 'desc' },
    limit,
  })
}

export async function unreadCount(userId: string): Promise<number> {
  const store = await db()
  return store.count('notifications', { where: { user_id: userId, read_at: { isNull: true } } })
}

export async function markRead(userId: string, notificationId?: string): Promise<void> {
  const store = await db()
  const now = new Date().toISOString()
  if (notificationId) {
    const notification = await store.findById('notifications', notificationId)
    // Scope the update to the owner so an id from another user is a no-op.
    if (notification?.user_id === userId) {
      await store.update('notifications', notificationId, { read_at: now })
    }
    return
  }
  await store.updateWhere('notifications', { user_id: userId, read_at: { isNull: true } }, { read_at: now })
}
