'use client'

import { useState, useTransition } from 'react'
import { TrendingDown } from 'lucide-react'
import { Alert, Button } from '@/components/ui/primitives'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import { bearCaseAction } from './actions'
import type { BearCasePayload } from '@/lib/ai/schemas'
import type { ScenarioResults } from '@/types/equity'

/**
 * The downside case, on demand.
 *
 * It sits under the risks rather than in its own panel beside them: an investor
 * asking "what could go wrong" and an investor asking "what if it does" are the
 * same person one sentence apart.
 */
export function BearCase({ offeringId }: { offeringId: string }) {
  const [data, setData] = useState<{ results: ScenarioResults; narrative: BearCasePayload } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="border-t border-line pt-3">
      {data ? null : (
        <Button
          type="button"
          className="gap-1.5"
          disabled={pending}
          onClick={() => startTransition(async () => { setData(await bearCaseAction(offeringId)) })}
        >
          <TrendingDown className="size-3.5" />
          {pending ? 'Modelling…' : 'What if it goes badly?'}
        </Button>
      )}

      {data ? (
        <div className="space-y-3">
          <h4 className="text-[13px] font-semibold text-ink">If it goes badly</h4>
          {data.results.insufficient_data ? (
            <Alert tone="warning">{data.results.insufficient_data}</Alert>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded border border-line bg-surface-sunken p-3 text-[12px] sm:grid-cols-4">
              <Row label="Coverage" value={formatRatio(data.results.dscr)} />
              <Row label="Cash to equity, year 1" value={formatCurrency(data.results.cash_flow_to_equity)} />
              <Row label="Return a year" value={formatPercent(data.results.irr_pct)} />
              <Row label="On every dollar" value={formatRatio(data.results.equity_multiple)} />
            </div>
          )}
          <p className="text-[12px] leading-relaxed text-ink-secondary">{data.narrative.narrative}</p>
          <div>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">What drives it</h5>
            <ul className="mt-1.5 space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
              {data.narrative.drivers.map((driver) => (
                <li key={driver.label}>
                  <span className="font-medium text-ink-secondary">{driver.label}.</span> {driver.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="tnum mt-0.5 font-semibold text-ink">{value}</div>
    </div>
  )
}
