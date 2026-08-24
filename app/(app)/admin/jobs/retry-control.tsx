'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/primitives'
import { retryJobAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

export function RetryControl({ jobId }: { jobId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(retryJobAction, {})
  return (
    <form action={submit}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Retrying…' : 'Retry'}</Button>
      {state.error ? <p className="mt-1 text-[11px] text-critical">{state.error}</p> : null}
      {state.success ? <p className="mt-1 text-[11px] text-positive">{state.success}</p> : null}
    </form>
  )
}
