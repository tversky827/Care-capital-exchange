'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/brand'
import { cn } from '@/lib/utils/cn'
import { navForRole, SETTINGS_ITEM, type NavRole } from './nav-config'

export function Sidebar({
  role, debtMarketplace = false, footer,
}: {
  role: NavRole
  debtMarketplace?: boolean
  footer?: React.ReactNode
}) {
  const pathname = usePathname()
  const groups = navForRole(role, debtMarketplace)

  const isActive = (href: string, prefix?: boolean) =>
    prefix ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href

  return (
    <aside className="no-print hidden w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center border-b border-line px-4">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {/* Keyed by position: a group's label is optional, and two unlabelled
            groups are a legitimate way to draw a divider. */}
        {groups.map((group, index) => (
          <div key={index} className="mb-5">
            {group.label ? <p className="eyebrow px-2 pb-1.5">{group.label}</p> : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-1.5 text-[13px] transition-colors rounded-[3px]',
                      isActive(item.href, item.prefix)
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2">
        <Link
          href={SETTINGS_ITEM.href}
          className={cn(
            'flex items-center gap-2.5 px-2 py-1.5 text-[13px] transition-colors rounded-[3px]',
            isActive(SETTINGS_ITEM.href)
              ? 'bg-accent-soft font-medium text-accent'
              : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
          )}
        >
          <SETTINGS_ITEM.icon className="size-4 shrink-0" />
          {SETTINGS_ITEM.label}
        </Link>
        {footer}
      </div>
    </aside>
  )
}

/** Compact horizontal navigation used below the top bar on small screens. */
export function MobileNav({ role, debtMarketplace = false }: { role: NavRole; debtMarketplace?: boolean }) {
  const pathname = usePathname()
  const items = navForRole(role, debtMarketplace).flatMap((group) => group.items)
  return (
    <nav className="no-print flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-1.5 lg:hidden">
      {items.map((item) => {
        const active = item.prefix ? pathname.startsWith(item.href) : pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-[12px] rounded-[3px]',
              active ? 'bg-accent-soft font-medium text-accent' : 'text-ink-secondary',
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
