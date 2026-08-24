'use client'

import { useActionState, useState } from 'react'
import { Lock } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from '@/components/ui/primitives'
import { addLenderNoteAction, requestInformationAction, updatePipelineStageAction } from '../../actions'
import { formatRelative, titleize } from '@/lib/utils/format'
import { DOCUMENT_TYPES } from '@/types'
import type { ActionState } from '@/app/(app)/deals/actions'

const STAGES = [
  'new_match', 'reviewing', 'requesting_information', 'underwriting', 'indication_submitted',
  'loi', 'diligence', 'credit_committee', 'closing', 'funded', 'passed',
] as const

export function PipelineControl({ distributionId, stage }: { distributionId: string; stage: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(updatePipelineStageAction, {})
  const [selected, setSelected] = useState(stage)

  return (
    <Card>
      <CardHeader><CardTitle>Pipeline stage</CardTitle></CardHeader>
      <CardBody>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="distributionId" value={distributionId} />
          <Select
            name="stage"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            aria-label="Pipeline stage"
          >
            {STAGES.map((entry) => <option key={entry} value={entry}>{titleize(entry)}</option>)}
          </Select>
          {selected === 'passed' ? (
            <Field label="Reason for passing" htmlFor="reason" hint="Shared with the borrower.">
              <Input id="reason" name="reason" placeholder="Leverage above our maximum for this asset type." />
            </Field>
          ) : null}
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <Button type="submit" size="sm" variant="primary" disabled={pending || selected === stage}>
            {pending ? 'Updating…' : 'Update stage'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

/**
 * Internal notes.
 *
 * Visible only inside the authoring institution — not to the borrower, not to a
 * competing lender, and not to a platform administrator. That exclusion is
 * enforced in the policy layer, not just hidden in the interface.
 */
export function LenderNotes({
  dealId, notes,
}: {
  dealId: string
  notes: { id: string; body: string; created_at: string }[]
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(addLenderNoteAction, {})

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Internal notes</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">Your institution only.</p>
        </div>
        <Badge tone="neutral" className="gap-1"><Lock className="size-2.5" /> Private</Badge>
      </CardHeader>

      {notes.length > 0 ? (
        <ul className="divide-y divide-line">
          {notes.map((note) => (
            <li key={note.id} className="px-4 py-2.5">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-secondary">{note.body}</p>
              <p className="mt-1 text-[10px] text-ink-muted">{formatRelative(note.created_at)}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <CardBody className="border-t border-line">
        <form action={submit} className="space-y-2">
          <input type="hidden" name="dealId" value={dealId} />
          <Textarea name="body" rows={2} placeholder="Credit committee reaction, internal pricing, next steps…" aria-label="Internal note" />
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Add note'}</Button>
        </form>
      </CardBody>
    </Card>
  )
}

export function RequestInformation({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(requestInformationAction, {})

  if (state.success) return <Alert tone="positive">{state.success}</Alert>

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Request information</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Goes to the borrower through the platform. Contact details are not exchanged.
          </p>
        </div>
        {!open ? <Button size="sm" onClick={() => setOpen(true)}>Ask</Button> : null}
      </CardHeader>

      {open ? (
        <CardBody>
          <form action={submit} className="space-y-3">
            <input type="hidden" name="dealId" value={dealId} />
            <Field label="Subject" htmlFor="subject">
              <Input id="subject" name="subject" required placeholder="Agency labor detail and staffing plan" />
            </Field>
            <Field label="What do you need?" htmlFor="body">
              <Textarea id="body" name="body" rows={4} required />
            </Field>
            <Field label="Documents required" htmlFor="docTypes" hint="Optional. Creates a tracked request on the borrower's data room.">
              <select
                id="docTypes"
                name="docTypes"
                multiple
                size={6}
                className="w-full border border-line-strong bg-surface px-2 py-1.5 text-[12px] text-ink rounded-[3px] focus:border-accent"
              >
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
              </select>
            </Field>
            {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={pending}>
                {pending ? 'Sending…' : 'Send request'}
              </Button>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </CardBody>
      ) : null}
    </Card>
  )
}
