'use client'

import { useActionState, useState } from 'react'
import { Button, Input, Select } from '@/components/ui/primitives'
import { setVerificationAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

export function VerificationControl({
  lenderId, current, name,
}: {
  lenderId: string
  current: string
  name: string
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(setVerificationAction, {})
  const [status, setStatus] = useState(current)

  return (
    <form
      action={submit}
      className="space-y-1.5"
      onSubmit={(event) => {
        if (status === 'verified' && current !== 'verified') return
        if (!window.confirm(`Set ${name} to ${status}? This changes what they can see immediately.`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="lenderId" value={lenderId} />
      <Select
        name="status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-7 text-[12px]"
        aria-label={`Verification status for ${name}`}
      >
        <option value="pending">Pending</option>
        <option value="verified">Verified</option>
        <option value="suspended">Suspended</option>
        <option value="rejected">Rejected</option>
      </Select>
      {status !== current ? (
        <>
          <Input name="note" placeholder="Note (optional)" className="h-7 text-[12px]" aria-label="Verification note" />
          <Button type="submit" size="sm" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Apply'}
          </Button>
        </>
      ) : null}
      {state.error ? <p className="text-[11px] text-critical">{state.error}</p> : null}
      {state.success ? <p className="text-[11px] text-positive">{state.success}</p> : null}
    </form>
  )
}
