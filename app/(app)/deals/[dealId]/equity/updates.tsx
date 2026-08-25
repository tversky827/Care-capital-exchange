'use client'

import { useActionState, useState } from 'react'
import { Alert, Badge, Button, CardBody, Field, Input, Section } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import { draftUpdateAction, publishUpdateAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { InvestorUpdate } from '@/types/equity'

/**
 * Quarterly reporting for the sponsor.
 *
 * The sponsor enters the period's actual figures and the analyst drafts the
 * narrative. Nothing reaches an investor until the sponsor reads it and
 * publishes — an update is the sponsor speaking to their investors, and the
 * platform does not put words in their mouth unread.
 */
export function UpdatesPanel({
  offeringId, dealId, updates, investorCount,
}: {
  offeringId: string
  dealId: string
  updates: InvestorUpdate[]
  investorCount: number
}) {
  const [open, setOpen] = useState(false)
  const [draftState, draftSubmit, draftPending] = useActionState<ActionState, FormData>(draftUpdateAction, {})
  const [publishState, publishSubmit, publishPending] = useActionState<ActionState, FormData>(publishUpdateAction, {})

  return (
    <Section
      title="Investor reporting"
      description={investorCount > 0
        ? `${investorCount} investor${investorCount === 1 ? '' : 's'} will receive what you publish here.`
        : 'Reporting becomes visible to investors once they hold a position.'}
    >
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? 'Cancel' : 'Draft a period update'}
          </Button>
        </div>

        {open ? (
          <form action={draftSubmit} className="space-y-3 rounded border border-line p-3">
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="dealId" value={dealId} />
            <Field label="Period" htmlFor="periodLabel" hint="For example, Q2 2027.">
              <Input id="periodLabel" name="periodLabel" required placeholder="Q2 2027" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Revenue" htmlFor="revenue"><Input id="revenue" name="revenue" inputMode="numeric" /></Field>
              <Field label="EBITDA" htmlFor="ebitda"><Input id="ebitda" name="ebitda" inputMode="numeric" /></Field>
              <Field label="Occupancy %" htmlFor="occupancy"><Input id="occupancy" name="occupancy" inputMode="numeric" /></Field>
              <Field label="Agency labour %" htmlFor="agencyLabor"><Input id="agencyLabor" name="agencyLabor" inputMode="numeric" /></Field>
              <Field label="Debt balance" htmlFor="debtBalance"><Input id="debtBalance" name="debtBalance" inputMode="numeric" /></Field>
              <Field label="Capital expenditure" htmlFor="capex"><Input id="capex" name="capex" inputMode="numeric" /></Field>
              <Field label="Distribution per $100k" htmlFor="distribution"><Input id="distribution" name="distribution" inputMode="numeric" /></Field>
            </div>
            <Field label="Notes for investors" htmlFor="notes" hint="Anything the figures do not explain. The draft will not invent causes.">
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className="w-full border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
              />
            </Field>
            {draftState.error ? <Alert tone="critical">{draftState.error}</Alert> : null}
            {draftState.success ? <Alert tone="positive">{draftState.success}</Alert> : null}
            <Button type="submit" variant="primary" size="sm" disabled={draftPending}>
              {draftPending ? 'Drafting…' : 'Draft the update'}
            </Button>
          </form>
        ) : null}

        {publishState.error ? <Alert tone="critical">{publishState.error}</Alert> : null}
        {publishState.success ? <Alert tone="positive">{publishState.success}</Alert> : null}

        {updates.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No period updates yet.</p>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="rounded border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-[13px] font-semibold text-ink">{update.title}</h4>
                  <p className="text-[11px] text-ink-muted">
                    {update.period_label} · {update.generator === 'ai' ? 'drafted by the analyst' : 'written by the sponsor'}
                    {update.published_at ? ` · published ${formatDate(update.published_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={update.status === 'published' ? 'positive' : 'warning'}>
                    {update.status === 'published' ? 'Published' : 'Draft'}
                  </Badge>
                  {update.status !== 'published' ? (
                    <form action={publishSubmit}>
                      <input type="hidden" name="updateId" value={update.id} />
                      <input type="hidden" name="dealId" value={dealId} />
                      <Button type="submit" size="sm" variant="primary" disabled={publishPending}>
                        Publish
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-secondary">
                {update.body}
              </pre>
            </div>
          ))
        )}
      </CardBody>
    </Section>
  )
}
