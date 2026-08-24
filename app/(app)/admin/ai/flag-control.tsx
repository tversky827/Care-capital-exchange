'use client'

import { useActionState, useState } from 'react'
import { Button, Input } from '@/components/ui/primitives'
import { flagAiOutputAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

export function FlagControl({ runId, kind }: { runId: string; kind: string }) {
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(flagAiOutputAction, {})

  if (state.success) return <span className="text-[11px] text-positive">Flagged</span>

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-ink-muted hover:text-warning">
        Flag output
      </button>
    )
  }

  return (
    <form action={submit} className="space-y-1">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="kind" value={kind} />
      <Input name="note" placeholder="What is wrong?" required className="h-7 text-[11px]" aria-label="Flag reason" />
      <div className="flex gap-1">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>Flag</Button>
        <Button type="button" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {state.error ? <p className="text-[11px] text-critical">{state.error}</p> : null}
    </form>
  )
}
