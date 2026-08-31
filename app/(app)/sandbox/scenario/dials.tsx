'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import { runScenarioAction } from './actions'
import type { ScenarioInputs, ScenarioResults } from '@/types/equity'

/**
 * The dials.
 *
 * Six assumptions an investor in this asset class actually argues about, with
 * a base case beside every result so the change is legible rather than the
 * level. Somebody who moves occupancy down five points wants to know what that
 * did, not what the number now is.
 *
 * Nothing here computes anything. The dials post to the server and the server
 * runs the same deterministic engine the offering page uses, so a scenario and
 * the page it came from cannot disagree.
 */

interface Dial {
  key: keyof ScenarioInputs
  label: string
  help: string
  min: number
  max: number
  step: number
  unit: string
}

const DIALS: Dial[] = [
  { key: 'occupancy_delta_pct', label: 'Occupancy', help: 'Percentage points against the stated level.', min: -15, max: 8, step: 1, unit: ' pts' },
  { key: 'revenue_delta_pct', label: 'Revenue', help: 'Rate and mix together, as a percentage.', min: -20, max: 12, step: 1, unit: '%' },
  { key: 'labor_delta_pct', label: 'Labour cost', help: 'Wages and agency. Up is worse.', min: -8, max: 20, step: 1, unit: '%' },
  { key: 'interest_rate_delta_pct', label: 'Interest rate', help: 'Percentage points on the debt.', min: -2, max: 5, step: 0.25, unit: ' pts' },
  { key: 'exit_multiple_delta', label: 'Exit multiple', help: 'Turns of EBITDA at sale.', min: -2, max: 1.5, step: 0.25, unit: 'x' },
  { key: 'hold_years_delta', label: 'Hold period', help: 'Years longer or shorter than targeted.', min: -2, max: 4, step: 1, unit: ' yrs' },
]

const PRESETS: { key: string; label: string; inputs: Partial<ScenarioInputs> }[] = [
  { key: 'base', label: 'As stated', inputs: {} },
  { key: 'soft', label: 'A soft year', inputs: { occupancy_delta_pct: -3, revenue_delta_pct: -3, labor_delta_pct: 4 } },
  {
    key: 'hard',
    label: 'A hard one',
    inputs: {
      occupancy_delta_pct: -8, revenue_delta_pct: -9, labor_delta_pct: 9,
      interest_rate_delta_pct: 1.5, exit_multiple_delta: -1,
    },
  },
  { key: 'good', label: 'It goes well', inputs: { occupancy_delta_pct: 3, revenue_delta_pct: 4, exit_multiple_delta: 0.5 } },
]

export function ScenarioDials({
  offeringId, baseIrrPct, baseMultiple, baseDscr,
}: {
  offeringId: string
  baseIrrPct: number | null
  baseMultiple: number | null
  baseDscr: number | null
}) {
  const [inputs, setInputs] = useState<Partial<ScenarioInputs>>({})
  const [results, setResults] = useState<ScenarioResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (next: Partial<ScenarioInputs>) => {
    setInputs(next)
    start(async () => {
      setError(null)
      const outcome = await runScenarioAction(offeringId, next)
      if (outcome.error) { setError(outcome.error); return }
      setResults(outcome.results ?? null)
    })
  }

  const changed = Object.values(inputs).some((value) => value !== 0 && value !== undefined)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader><CardTitle>Change an assumption</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => run(preset.inputs)}
                className="rounded border border-line px-2.5 py-1 text-[12px] text-ink-secondary hover:border-accent hover:text-accent"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {DIALS.map((dial) => {
              const value = inputs[dial.key] ?? 0
              return (
                <div key={dial.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={dial.key} className="text-[12px] font-medium text-ink">
                      {dial.label}
                    </label>
                    <span className={`tnum text-[12px] font-medium ${value === 0 ? 'text-ink-muted' : 'text-accent'}`}>
                      {value > 0 ? '+' : ''}{value}{dial.unit}
                    </span>
                  </div>
                  <input
                    id={dial.key}
                    type="range"
                    min={dial.min}
                    max={dial.max}
                    step={dial.step}
                    value={value}
                    onChange={(event) => setInputs({ ...inputs, [dial.key]: Number(event.target.value) })}
                    onMouseUp={() => run(inputs)}
                    onTouchEnd={() => run(inputs)}
                    onKeyUp={() => run(inputs)}
                    className="mt-1.5 w-full accent-[var(--color-accent)]"
                  />
                  <p className="mt-0.5 text-[11px] text-ink-muted">{dial.help}</p>
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 border-t border-line pt-3">
            <Button type="button" variant="primary" className="flex-1" disabled={pending} onClick={() => run(inputs)}>
              {pending ? 'Running…' : 'Run it'}
            </Button>
            <Button type="button" className="flex-1" onClick={() => run({})} disabled={pending}>
              Back to as stated
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>What the model says</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          {error ? <Alert tone="critical">{error}</Alert> : null}

          {results === null ? (
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Move a dial, or pick one of the four above. The result appears here beside the
              operator&rsquo;s own stated case.
            </p>
          ) : results.insufficient_data ? (
            <Alert tone="warning">{results.insufficient_data}</Alert>
          ) : (
            <dl className="space-y-2.5">
              <Compare
                label="Return a year"
                base={baseIrrPct === null ? null : formatPercent(baseIrrPct)}
                now={results.irr_pct === null ? null : formatPercent(results.irr_pct)}
                worse={baseIrrPct !== null && results.irr_pct !== null && results.irr_pct < baseIrrPct}
              />
              <Compare
                label="On every dollar"
                base={baseMultiple === null ? null : formatRatio(baseMultiple)}
                now={results.equity_multiple === null ? null : formatRatio(results.equity_multiple)}
                worse={baseMultiple !== null && results.equity_multiple !== null && results.equity_multiple < baseMultiple}
              />
              <Compare
                label="Debt coverage"
                base={baseDscr === null ? null : formatRatio(baseDscr)}
                now={results.dscr === null ? null : formatRatio(results.dscr)}
                worse={baseDscr !== null && results.dscr !== null && results.dscr < baseDscr}
              />
              <Compare label="Net operating income" base={null} now={formatCurrency(results.noi)} worse={false} />
              <Compare label="Cash to the equity" base={null} now={formatCurrency(results.cash_flow_to_equity)} worse={false} />
              <Compare label="Paid out over the hold" base={null} now={formatCurrency(results.investor_distributions)} worse={false} />
            </dl>
          )}

          {results !== null && results.dscr !== null && results.dscr < 1 ? (
            <Alert tone="critical" title="The debt is not covered">
              At these assumptions the property does not earn its debt service. In a real deal that
              is a default conversation with the lender before it is a return conversation.
            </Alert>
          ) : null}

          <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-muted">
            {changed
              ? 'A scenario, not a forecast. It says what this model produces on these assumptions — nothing about how likely they are, and nothing about whether to invest.'
              : 'These are the operator’s own stated assumptions, run through the same model the offering page uses.'}
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function Compare({
  label, base, now, worse,
}: {
  label: string
  base: string | null
  now: string | null
  worse: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="flex items-baseline gap-2 text-right">
        {base ? <span className="tnum text-[11px] text-ink-muted line-through decoration-line-strong">{base}</span> : null}
        <span className={`tnum text-[14px] font-semibold ${worse ? 'text-critical' : 'text-ink'}`}>
          {now ?? '—'}
        </span>
      </dd>
    </div>
  )
}
