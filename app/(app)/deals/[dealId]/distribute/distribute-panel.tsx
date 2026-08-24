'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, Textarea, type Tone,
} from '@/components/ui/primitives'
import { distributeDealAction, type ActionState } from '../../actions'
import { cn } from '@/lib/utils/cn'

interface LenderOption {
  id: string
  name: string
  type: string
  initials: string
  score: number
  band: string
  alreadySent: boolean
}

const BAND_TONE: Record<string, Tone> = {
  strong: 'positive', good: 'accent', possible: 'warning', outside_box: 'neutral',
}

/**
 * Distribution confirmation.
 *
 * Two deliberate frictions: the recipient list is named in full before the
 * action is available, and the confirm button restates the count. Sharing a
 * borrower's financials is not an action that should be one click away from an
 * ambiguous state.
 */
export function DistributePanel({
  dealId, lenders, canDistributeNow, blockingReason, isAdmin, anonymised,
}: {
  dealId: string
  lenders: LenderOption[]
  canDistributeNow: boolean
  blockingReason: string | null
  isAdmin: boolean
  anonymised: boolean
}) {
  const available = lenders.filter((lender) => !lender.alreadySent)
  const [selected, setSelected] = useState<string[]>(available.map((lender) => lender.id))
  const [confirming, setConfirming] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(distributeDealAction, {})

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))

  const chosen = lenders.filter((lender) => selected.includes(lender.id))
  const blocked = !canDistributeNow && !isAdmin

  if (state.success) {
    return <Alert tone="positive" title="Deal distributed">{state.success}</Alert>
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Select recipients</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {available.length} lender{available.length === 1 ? '' : 's'} available.{' '}
            {anonymised
              ? 'Distributing reveals the facility identity and opens the data room to the lenders you choose.'
              : 'The facility identity is already visible on the marketplace for this deal.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setSelected(available.map((lender) => lender.id))}>Select all</Button>
          <Button size="sm" onClick={() => setSelected([])}>Clear</Button>
        </div>
      </CardHeader>

      <CardBody>
        <ul className="space-y-1.5">
          {lenders.map((lender) => (
            <li key={lender.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 border p-3 transition-colors',
                  lender.alreadySent
                    ? 'cursor-not-allowed border-line bg-surface-sunken opacity-60'
                    : selected.includes(lender.id)
                      ? 'border-accent bg-accent-soft/50'
                      : 'border-line hover:border-line-strong hover:bg-surface-sunken/60',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(lender.id)}
                  disabled={lender.alreadySent}
                  onChange={() => toggle(lender.id)}
                  className="accent-[#1f4e79]"
                />
                <span className="flex size-8 shrink-0 items-center justify-center bg-accent text-[11px] font-semibold text-white rounded-[2px]">
                  {lender.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{lender.name}</span>
                  <span className="block text-[11px] text-ink-muted">{lender.type}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {lender.alreadySent ? <Badge tone="neutral">Already shared</Badge> : null}
                  <Badge tone={BAND_TONE[lender.band] ?? 'neutral'}>{lender.score}%</Badge>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <form action={submit} className="mt-5 border-t border-line pt-4">
          <input type="hidden" name="dealId" value={dealId} />
          {selected.map((id) => (
            <input key={id} type="hidden" name="lenderIds" value={id} />
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Distribution scope"
              htmlFor="scope"
              hint="Marketplace additionally lists the opportunity for any verified lender to discover, under its anonymised label."
            >
              <Select id="scope" name="scope" defaultValue="selected_lenders">
                <option value="selected_lenders">Selected lenders only</option>
                <option value="matched_lenders">All matched lenders</option>
                <option value="marketplace">Selected lenders and the marketplace</option>
                <option value="invite_only">Invite only</option>
              </Select>
            </Field>
            <Field label="Message to lenders" htmlFor="message" hint="Optional. Appears in the notification they receive.">
              <Textarea id="message" name="message" rows={2} />
            </Field>
          </div>

          {blocked ? (
            <Alert tone="warning" className="mt-4" icon={<AlertTriangle className="size-4" />}>
              {blockingReason ?? 'This deal is not yet ready for distribution.'}
            </Alert>
          ) : null}

          {isAdmin && !canDistributeNow ? (
            <label className="mt-4 flex items-start gap-2 border border-warning/25 bg-warning-soft p-3">
              <input type="checkbox" name="override" value="yes" className="mt-0.5 accent-[#9a5b06]" />
              <span className="text-[12px] leading-relaxed text-warning">
                Override the readiness requirement. This is recorded in the audit log as an
                administrator override, along with the readiness score at the time.
              </span>
            </label>
          ) : null}

          {state.error ? <Alert tone="critical" className="mt-4">{state.error}</Alert> : null}

          {confirming && chosen.length > 0 ? (
            <Alert tone="accent" className="mt-4" title={`You are about to share this financing package with ${chosen.length} lender${chosen.length === 1 ? '' : 's'}`}>
              <ul className="mt-1 space-y-0.5">
                {chosen.map((lender) => (
                  <li key={lender.id}>· {lender.name}</li>
                ))}
              </ul>
              <p className="mt-2">
                Each will receive the credit memo, the underwriting metrics, and the documents you have
                marked visible to lenders. This is recorded in the audit log.
              </p>
            </Alert>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <Button type="submit" variant="primary" disabled={pending || blocked || chosen.length === 0}>
                  {pending ? 'Distributing…' : `Confirm — share with ${chosen.length} lender${chosen.length === 1 ? '' : 's'}`}
                </Button>
                <Button type="button" onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => setConfirming(true)}
                disabled={chosen.length === 0 || blocked}
              >
                Review {chosen.length} recipient{chosen.length === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
