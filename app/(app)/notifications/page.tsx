import Link from 'next/link'
import type { Metadata } from 'next'
import { requireActor } from '@/lib/auth/session'
import { listNotifications } from '@/services/notifications'
import { Badge, Card, EmptyState, PageHeader, Section } from '@/components/ui/primitives'
import { MarkAllRead } from './mark-all-read'
import { formatDateTime, formatRelative, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Notifications' }

const TONE = { info: 'accent', success: 'positive', warning: 'warning', critical: 'critical' } as const

export default async function NotificationsPage() {
  const actor = await requireActor()
  const notifications = await listNotifications(actor.user.id, 200)
  const unread = notifications.filter((entry) => !entry.read_at)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        eyebrow={actor.company.name}
        title="Notifications"
        description={unread.length ? `${unread.length} unread.` : 'You are all caught up.'}
        actions={unread.length ? <MarkAllRead /> : null}
      />

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing yet"
            description="You will be notified when documents finish processing, when analysis completes, when lenders view or respond to your deals, and when financing indications arrive."
          />
        </Card>
      ) : (
        <Section title="Recent">
          <ul className="divide-y divide-line">
            {notifications.map((notification) => {
              const content = (
                <div className={`flex gap-3 px-4 py-3 ${!notification.read_at ? 'bg-accent-soft/30' : ''}`}>
                  <Badge tone={TONE[notification.severity]} className="mt-0.5 h-fit shrink-0">
                    {titleize(notification.event.split('.')[1] ?? notification.event)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{notification.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{notification.body}</p>
                    <p className="mt-1 text-[11px] text-ink-muted" title={formatDateTime(notification.created_at)}>
                      {formatRelative(notification.created_at)}
                      {notification.emailed_at ? ' · emailed' : ''}
                    </p>
                  </div>
                </div>
              )
              return (
                <li key={notification.id}>
                  {notification.href ? (
                    <Link href={notification.href} className="block hover:bg-surface-sunken">{content}</Link>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
