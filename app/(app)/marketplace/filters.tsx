'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button, Card, CardBody, Field, Input, Select } from '@/components/ui/primitives'
import { titleize } from '@/lib/utils/format'
import { SaveSearchDialog } from './saved-searches'

/**
 * Marketplace filters.
 *
 * Filter state lives in the URL so a filtered view can be shared, bookmarked
 * and turned into a saved search without a separate state store.
 */
export function MarketplaceFilters({
  assetTypes, transactionTypes, states,
}: {
  assetTypes: string[]
  transactionTypes: string[]
  states: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const active = [...params.keys()].filter((key) => params.get(key))
  const value = (key: string) => params.get(key) ?? ''

  function apply(formData: FormData) {
    const next = new URLSearchParams()
    for (const [key, raw] of formData.entries()) {
      const entry = String(raw).trim()
      if (entry) next.set(key, entry)
    }
    router.push(`/marketplace?${next.toString()}`)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-ink"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {active.length ? (
            <span className="tnum flex size-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">
              {active.length}
            </span>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          {active.length ? (
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => router.push('/marketplace')}>
              <X className="size-3" /> Clear
            </Button>
          ) : null}
          <SaveSearchDialog />
        </div>
      </div>

      {open ? (
        <CardBody className="border-t border-line">
          <form action={apply}>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="State" htmlFor="state">
                <Select id="state" name="state" defaultValue={value('state')}>
                  <option value="">Any</option>
                  {states.map((state) => <option key={state} value={state}>{state}</option>)}
                </Select>
              </Field>
              <Field label="Asset type" htmlFor="asset">
                <Select id="asset" name="asset" defaultValue={value('asset')}>
                  <option value="">Any</option>
                  {assetTypes.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
                </Select>
              </Field>
              <Field label="Transaction" htmlFor="transaction">
                <Select id="transaction" name="transaction" defaultValue={value('transaction')}>
                  <option value="">Any</option>
                  {transactionTypes.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
                </Select>
              </Field>
              <Field label="Inside my lending box" htmlFor="inBox">
                <Select id="inBox" name="inBox" defaultValue={value('inBox')}>
                  <option value="">Show all</option>
                  <option value="yes">Only opportunities inside my box</option>
                </Select>
              </Field>
              <Field label="Minimum loan" htmlFor="minLoan"><Input id="minLoan" name="minLoan" defaultValue={value('minLoan')} placeholder="3000000" /></Field>
              <Field label="Maximum loan" htmlFor="maxLoan"><Input id="maxLoan" name="maxLoan" defaultValue={value('maxLoan')} placeholder="25000000" /></Field>
              <Field label="Maximum LTV %" htmlFor="maxLtv"><Input id="maxLtv" name="maxLtv" defaultValue={value('maxLtv')} placeholder="80" /></Field>
              <Field label="Minimum DSCR" htmlFor="minDscr"><Input id="minDscr" name="minDscr" defaultValue={value('minDscr')} placeholder="1.35" /></Field>
              <Field label="Minimum debt yield %" htmlFor="minDebtYield"><Input id="minDebtYield" name="minDebtYield" defaultValue={value('minDebtYield')} placeholder="11" /></Field>
              <Field label="Minimum occupancy %" htmlFor="minOccupancy"><Input id="minOccupancy" name="minOccupancy" defaultValue={value('minOccupancy')} placeholder="80" /></Field>
              <Field label="Maximum Medicaid %" htmlFor="maxMedicaid"><Input id="maxMedicaid" name="maxMedicaid" defaultValue={value('maxMedicaid')} placeholder="70" /></Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" size="sm">Apply filters</Button>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </form>
        </CardBody>
      ) : null}
    </Card>
  )
}
