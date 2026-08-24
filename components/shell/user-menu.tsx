'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { initials } from '@/lib/utils/format'

export function UserMenu({
  name, email, organisation, organisationType, onSignOut,
}: {
  name: string
  email: string
  organisation: string
  organisationType: string
  onSignOut: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 border border-line py-1 pl-1 pr-2 text-left transition-colors hover:bg-surface-sunken rounded-[3px]"
      >
        <span className="flex size-6 items-center justify-center bg-accent text-[10px] font-semibold text-white rounded-[2px]">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-32 truncate text-[12px] font-medium leading-tight text-ink">{name}</span>
          <span className="block max-w-32 truncate text-[10px] leading-tight text-ink-muted">{organisation}</span>
        </span>
        <ChevronDown className="size-3.5 text-ink-muted" />
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-64 border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-ink">{name}</p>
            <p className="truncate text-[11px] text-ink-muted">{email}</p>
            <p className="mt-1.5 truncate text-[11px] text-ink-secondary">
              {organisation} <span className="text-ink-muted">· {organisationType}</span>
            </p>
          </div>
          <div className="py-1">
            <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-surface-sunken hover:text-ink">
              <Settings className="size-3.5" /> Settings
            </Link>
            <Link href="/settings#profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-surface-sunken hover:text-ink">
              <User className="size-3.5" /> Profile
            </Link>
          </div>
          <form action={onSignOut} className="border-t border-line">
            <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-ink-secondary hover:bg-surface-sunken hover:text-ink">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
