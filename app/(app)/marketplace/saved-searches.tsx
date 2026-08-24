'use client'

import { useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bell, BookmarkPlus } from 'lucide-react'
import { Alert, Badge, Button, Card, CardBody, Field, Input, Select } from '@/components/ui/primitives'
import { deleteSavedSearchAction, saveSearchAction } from '@/app/(app)/lender/actions'
import type { ActionState } from '@/app/(app)/deals/actions'

export function SaveSearchDialog() {
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(saveSearchAction, {})

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <BookmarkPlus className="size-3.5" /> Save this search
      </Button>
    )
  }

  return (
    <Card className="absolute right-4 z-30 w-80 shadow-sm">
      <CardBody>
        <form action={submit} className="space-y-3">
          {/* Carry the current filter set into the saved criteria. */}
          <input type="hidden" name="states" value={params.get('state') ?? ''} />
          <input type="hidden" name="min_loan" value={params.get('minLoan') ?? ''} />
          <input type="hidden" name="max_loan" value={params.get('maxLoan') ?? ''} />
          <input type="hidden" name="max_ltv_pct" value={params.get('maxLtv') ?? ''} />
          <input type="hidden" name="min_dscr" value={params.get('minDscr') ?? ''} />
          <input type="hidden" name="min_debt_yield_pct" value={params.get('minDebtYield') ?? ''} />
          <input type="hidden" name="min_occupancy_pct" value={params.get('minOccupancy') ?? ''} />
          <input type="hidden" name="max_medicaid_pct" value={params.get('maxMedicaid') ?? ''} />
          {params.get('asset') ? <input type="hidden" name="asset_types" value={params.get('asset')!} /> : null}
          {params.get('transaction') ? <input type="hidden" name="transaction_types" value={params.get('transaction')!} /> : null}

          <Field label="Name this search" htmlFor="name">
            <Input id="name" name="name" required placeholder="Upper Midwest SNF, $5M–$15M" />
          </Field>
          <Field label="Alert me on new matches" htmlFor="alert_enabled">
            <Select id="alert_enabled" name="alert_enabled" defaultValue="yes">
              <option value="yes">Yes — notify me</option>
              <option value="no">No — save only</option>
            </Select>
          </Field>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save search'}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

export function SavedSearches({
  searches,
}: {
  searches: { id: string; name: string; alertEnabled: boolean }[]
}) {
  const [state, submit] = useActionState<ActionState, FormData>(deleteSavedSearchAction, {})
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Saved searches</span>
        {searches.map((search) => (
          <span key={search.id} className="flex items-center gap-1.5 border border-line px-2 py-1 rounded-[3px]">
            <span className="text-[12px] text-ink">{search.name}</span>
            {search.alertEnabled ? (
              <Badge tone="accent" className="gap-1"><Bell className="size-2.5" /> Alerts on</Badge>
            ) : null}
            <form action={submit}>
              <input type="hidden" name="searchId" value={search.id} />
              <button type="submit" className="text-[11px] text-ink-muted hover:text-critical" aria-label={`Remove ${search.name}`}>
                ×
              </button>
            </form>
          </span>
        ))}
        {state.error ? <span className="text-[11px] text-critical">{state.error}</span> : null}
      </CardBody>
    </Card>
  )
}
