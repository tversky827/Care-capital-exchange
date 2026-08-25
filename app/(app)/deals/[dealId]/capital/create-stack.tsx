'use client'

import { useActionState } from 'react'
import { Alert, Button } from '@/components/ui/primitives'
import { draftStackAction } from '../equity/actions'
import type { ActionState } from '@/app/(app)/deals/actions'

/** Drafts a capital structure from the deal's own underwriting. */
export function CreateStackButton({ dealId, disabled }: { dealId: string; disabled?: boolean }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(draftStackAction, {})
  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
      <Button type="submit" variant="primary" size="sm" disabled={disabled || pending}>
        {pending ? 'Drafting…' : 'Draft from this deal'}
      </Button>
    </form>
  )
}
