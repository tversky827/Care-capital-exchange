import { GlobalSearch } from './global-search'
import { NotificationBell } from './notification-bell'
import { UserMenu } from './user-menu'
import { logoutAction } from '@/app/(auth)/actions'
import { listNotifications, unreadCount } from '@/services/notifications'
import { titleize } from '@/lib/utils/format'
import type { Actor } from '@/lib/auth/session'

export async function TopBar({ actor }: { actor: Actor }) {
  const [notifications, unread] = await Promise.all([
    listNotifications(actor.user.id, 15),
    unreadCount(actor.user.id),
  ])

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
      <div className="flex-1">
        <GlobalSearch />
      </div>
      <NotificationBell
        initial={notifications.map((n) => ({
          id: n.id, title: n.title, body: n.body, href: n.href,
          severity: n.severity, read_at: n.read_at, created_at: n.created_at,
        }))}
        initialUnread={unread}
      />
      <UserMenu
        name={actor.user.full_name}
        email={actor.user.email}
        organisation={actor.company.name}
        organisationType={titleize(actor.company.type)}
        onSignOut={logoutAction}
      />
    </header>
  )
}
