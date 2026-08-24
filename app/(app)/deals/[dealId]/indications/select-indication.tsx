'use client'

import { useActionState, useState } from 'react'
import { Alert, Button, Textarea } from '@/components/ui/primitives'
import { selectIndicationAction, type ActionState } from '../../actions'

export function SelectIndication({
  dealId, indicationId, lenderName,
}: {
  dealId: string
  indicationId: string
  lenderName: string
}) {
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(selectIndicationAction, {})

  if (state.success) return <Alert tone="positive">{state.success}</Alert>

  if (!open) {
    return <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Select as preferred</Button>
  }

  return (
    <form action={submit} className="w-full max-w-md space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="indicationId" value={indicationId} />
      <p className="text-[12px] leading-relaxed text-ink-secondary">
        Selecting {lenderName} moves the deal to diligence and notifies the other lenders that their
        indications were not selected. It is not a binding acceptance of terms.
      </p>
      <Textarea name="note" rows={2} placeholder="Optional message to the lender." />
      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? 'Selecting…' : `Confirm ${lenderName}`}
        </Button>
        <Button type="button" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
