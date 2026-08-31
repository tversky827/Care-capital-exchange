'use client'

import { useState } from 'react'
import { GLOSSARY_BY_KEY } from '@/lib/sandbox/glossary'

/**
 * A term with its explanation one press away.
 *
 * A dotted underline rather than an icon: it reads as ordinary prose to
 * somebody who already knows the word, and as an offer to somebody who does
 * not. Press rather than hover, because hover does not exist on a phone and a
 * definition that only appears on a desktop is a definition for people who
 * already have advisers.
 */
export function Term({ term, children }: { term: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const entry = GLOSSARY_BY_KEY.get(term)
  if (!entry) return <>{children}</>

  return (
    <span className="relative inline">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="underline decoration-dotted decoration-ink-muted underline-offset-2 hover:decoration-accent hover:text-accent"
      >
        {children ?? entry.label}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-30 mt-1 block w-72 rounded border border-line bg-surface p-3 shadow-sm">
          <span className="block text-[12px] font-semibold text-ink">{entry.label}</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-secondary">{entry.short}</span>
          <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">{entry.detail}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[11px] text-accent hover:underline"
          >
            Close
          </button>
        </span>
      ) : null}
    </span>
  )
}
