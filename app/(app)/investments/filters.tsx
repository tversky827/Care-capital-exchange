'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { Button, Card, Field, Input, Label, Select } from '@/components/ui/primitives'
import { ASSET_TYPES } from '@/types'
import { toggleSavedAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * Marketplace filters.
 *
 * State lives in the URL rather than the component so a filtered view can be
 * bookmarked and shared, and so the server does the filtering — a listing
 * never carries offerings the viewer would then have to be prevented from
 * seeing.
 */
export function MarketplaceFilters({ total, showing }: { total: number; showing: number }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const apply = (next: Record<string, string>) => {
    const query = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    router.push(`/investments?${query.toString()}`)
  }

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search offerings…"
            defaultValue={params.get('q') ?? ''}
            className="w-56"
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply({ q: (event.target as HTMLInputElement).value })
            }}
          />
          <Button type="button" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide filters' : 'Filters'}
          </Button>
          {[...params.keys()].length > 0 ? (
            <Button type="button" size="sm" onClick={() => router.push('/investments')}>Clear</Button>
          ) : null}
        </div>
        <span className="text-[12px] text-ink-muted">
          {showing === total ? `${total} offerings` : `${showing} of ${total} offerings`}
        </span>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Asset type</Label>
            <Select
              className="mt-1"
              defaultValue={params.get('asset') ?? ''}
              onChange={(event) => apply({ asset: event.target.value })}
            >
              <option value="">Any</option>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </div>
          <Field label="State" htmlFor="state-filter">
            <Input
              id="state-filter"
              maxLength={2}
              placeholder="IL"
              defaultValue={params.get('state') ?? ''}
              onBlur={(event) => apply({ state: event.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Maximum minimum investment" htmlFor="min-filter">
            <Input
              id="min-filter"
              inputMode="numeric"
              placeholder="100000"
              defaultValue={params.get('maxMin') ?? ''}
              onBlur={(event) => apply({ maxMin: event.target.value })}
            />
          </Field>
          <div>
            <Label>Capital position</Label>
            <Select
              className="mt-1"
              defaultValue={params.get('position') ?? ''}
              onChange={(event) => apply({ position: event.target.value })}
            >
              <option value="">Any</option>
              <option value="common_equity">Common equity</option>
              <option value="preferred_equity">Preferred equity</option>
              <option value="mezzanine">Mezzanine</option>
            </Select>
          </div>
          <Field label="Maximum hold, years" htmlFor="hold-filter">
            <Input
              id="hold-filter"
              inputMode="numeric"
              placeholder="7"
              defaultValue={params.get('maxHold') ?? ''}
              onBlur={(event) => apply({ maxHold: event.target.value })}
            />
          </Field>
          <Field label="Minimum target return, %" htmlFor="return-filter">
            <Input
              id="return-filter"
              inputMode="numeric"
              placeholder="12"
              defaultValue={params.get('minReturn') ?? ''}
              onBlur={(event) => apply({ minReturn: event.target.value })}
            />
          </Field>
          <div>
            <Label>Include</Label>
            <Select
              className="mt-1"
              defaultValue={params.get('status') ?? 'live'}
              onChange={(event) => apply({ status: event.target.value })}
            >
              <option value="live">Open offerings only</option>
              <option value="all">Open and closed</option>
            </Select>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/** Watchlist toggle. */
export function SaveButton({ offeringId, saved }: { offeringId: string; saved: boolean }) {
  const [, submit, pending] = useActionState<ActionState, FormData>(toggleSavedAction, {})
  return (
    <form action={submit}>
      <input type="hidden" name="offeringId" value={offeringId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
        className="flex items-center gap-1 text-[12px] text-ink-muted hover:text-accent"
      >
        {saved ? <BookmarkCheck className="size-3.5 text-accent" /> : <Bookmark className="size-3.5" />}
        {saved ? 'Saved' : 'Save'}
      </button>
    </form>
  )
}

/** Selects offerings to compare. Capped at four, which is what fits legibly. */
export function CompareBar({ ids }: { ids: string[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length >= 4 ? current : [...current, id])
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-surface-sunken px-3 py-2">
      <span className="text-[12px] text-ink-muted">Compare up to four:</span>
      {ids.map((id, index) => (
        <button
          key={id}
          type="button"
          onClick={() => toggle(id)}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            selected.includes(id) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-muted'
          }`}
        >
          {index + 1}
        </button>
      ))}
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={selected.length < 2}
        onClick={() => router.push(`/investments/compare?ids=${selected.join(',')}`)}
      >
        Compare {selected.length > 0 ? `(${selected.length})` : ''}
      </Button>
    </div>
  )
}
