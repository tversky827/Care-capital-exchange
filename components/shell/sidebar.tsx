'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
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

/**
 * Navigation on a phone.
 *
 * A bar at the bottom rather than a strip under the top bar: it sits where a
 * thumb already is, and every destination is visible at once. The strip it
 * replaced scrolled horizontally, which put the later items off-screen with
 * nothing to say they were there.
 *
 * Five is the limit a row of labelled icons can hold before the labels stop
 * being readable, so anything past the fifth moves into "More". Settings is
 * always the last thing reachable, whether or not it lands in the overflow.
 */
export function MobileNav({ role, debtMarketplace = false }: { role: NavRole; debtMarketplace?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const all = [...navForRole(role, debtMarketplace).flatMap((group) => group.items), SETTINGS_ITEM]
  const overflowing = all.length > 5
  const primary = overflowing ? all.slice(0, 4) : all
  const overflow = overflowing ? all.slice(4) : []

  const isActive = (href: string, prefix?: boolean) =>
    prefix ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href

  return (
    <>
      {/* Keeps the last of the page clear of the bar, which is fixed. */}
      <div className="h-14 lg:hidden" aria-hidden />

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <nav className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface lg:hidden">
        {open ? (
          <ul className="border-b border-line">
            {overflow.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-2.5 text-[13px]',
                    isActive(item.href, item.prefix)
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-ink-secondary',
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(item.href, item.prefix)
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-0.5 px-1',
                    active ? 'text-accent' : 'text-ink-muted',
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  <span className={cn('w-full truncate text-center text-[10px]', active && 'font-medium')}>
                    {item.short ?? item.label}
                  </span>
                </Link>
              </li>
            )
          })}
          {overflowing ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                className={cn(
                  'flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1',
                  overflow.some((item) => isActive(item.href, item.prefix)) || open
                    ? 'text-accent'
                    : 'text-ink-muted',
                )}
              >
                <MoreHorizontal className="size-[18px] shrink-0" />
                <span className="text-[10px]">More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  )
}
