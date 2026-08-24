'use client'

import { useActionState, useState } from 'react'
import { Button, Input } from '@/components/ui/primitives'
import { approveLineItemAction, type ActionState } from '../../actions'

/**
 * Approving an extracted figure. The proposed value is pre-filled and editable,
 * because the common correction is a small one — a typo in the source, or a
 * figure that belongs in a different period.
 */
export function ApproveRow({
  dealId, lineItemId, proposed,
}: {
  dealId: string
  lineItemId: string
  proposed: number | null
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(approveLineItemAction, {})
  const [value, setValue] = useState(proposed?.toString() ?? '')

  return (
    <form action={submit} className="flex items-center gap-1.5">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="lineItemId" value={lineItemId} />
      <Input
        name="value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-7 w-32 text-[12px]"
        aria-label="Approved value"
      />
      <Button type="submit" size="sm" variant="primary" disabled={pending}>
        {pending ? '…' : 'Approve'}
      </Button>
      {state.error ? <span className="text-[11px] text-critical">{state.error}</span> : null}
    </form>
  )
}
