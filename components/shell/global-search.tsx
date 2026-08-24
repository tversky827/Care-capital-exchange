'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { SearchResult } from '@/services/search'
import { titleize } from '@/lib/utils/format'

/**
 * Global search.
 *
 * Results come from the permission-aware search service, so the list a user
 * sees is already scoped to what they may open — the client never filters.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const term = query.trim()
  // Whether results are shown is derived from the query rather than mirrored
  // into state, so a short query needs no effect to clear anything.
  const visible = term.length >= 2 ? results : []

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) return
    const controller = new AbortController()
    // Debounced so typing does not fire a request per keystroke. The loading
    // flag is set when the request actually starts rather than on every
    // keystroke, which also avoids a flash of "Searching…" while debouncing.
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Search failed')
        const data = (await response.json()) as { results: SearchResult[] }
        setResults(data.results)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search deals, documents, lenders…"
          aria-label="Global search"
          className="h-8 w-full border border-line bg-canvas pl-8 pr-8 text-[13px] text-ink placeholder:text-ink-muted rounded-[3px] focus:border-accent focus:bg-surface"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-line px-1 text-[10px] text-ink-muted">/</kbd>
        )}
      </div>

      {open && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-9 z-50 max-h-96 overflow-y-auto border border-line bg-surface shadow-sm">
          {loading ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">Searching…</p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">
              Nothing matched “{query.trim()}” that you have access to.
            </p>
          ) : (
            <ul>
              {visible.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <Link
                    href={result.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{result.title}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{result.subtitle}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.05em] text-ink-muted">
                      {titleize(result.kind)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
