'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'

interface NotificationItem {
  id: string
  title: string
  body: string
  href: string | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  read_at: string | null
  created_at: string
}

export function NotificationBell({
  initial, initialUnread,
}: {
  initial: NotificationItem[]
  initialUnread: number
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initial)
  const [unread, setUnread] = useState(initialUnread)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function markAllRead() {
    setUnread(0)
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
    await fetch('/api/notifications/read', { method: 'POST' }).catch(() => undefined)
  }

  const severityTone = {
    info: 'bg-accent', success: 'bg-positive', warning: 'bg-warning', critical: 'bg-critical',
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-8 items-center justify-center border border-line text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink rounded-[3px]"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="tnum absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-50 w-88 max-w-[calc(100vw-2rem)] border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[12px] font-semibold text-ink">Notifications</span>
            {unread > 0 ? (
              <button type="button" onClick={markAllRead} className="text-[11px] text-accent hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ink-muted">You are all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.slice(0, 12).map((item) => {
                const content = (
                  <div className={cn('flex gap-2.5 px-3 py-2.5', !item.read_at && 'bg-accent-soft/30')}>
                    <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', severityTone[item.severity])} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium leading-snug text-ink">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-muted">{item.body}</p>
                      <p className="mt-1 text-[10px] text-ink-muted">{formatRelative(item.created_at)}</p>
                    </div>
                  </div>
                )
                return (
                  <li key={item.id} className="border-b border-line last:border-b-0">
                    {item.href ? (
                      <Link href={item.href} onClick={() => setOpen(false)} className="block hover:bg-surface-sunken">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2 text-center text-[12px] text-accent hover:bg-surface-sunken"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  )
}
