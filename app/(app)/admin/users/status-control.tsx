'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/primitives'
import { setCompanyStatusAction, setUserStatusAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

export function StatusControl({
  kind, id, name, status,
}: {
  kind: 'user' | 'company'
  id: string
  name: string
  status: string
}) {
  const action = kind === 'user' ? setUserStatusAction : setCompanyStatusAction
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, {})
  const next = status === 'active' ? 'suspended' : 'active'

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        const verb = next === 'suspended' ? 'Suspend' : 'Reinstate'
        if (!window.confirm(`${verb} ${name}? ${next === 'suspended' ? 'They will be signed out and lose access immediately.' : 'Access is restored immediately.'}`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name={kind === 'user' ? 'userId' : 'companyId'} value={id} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" size="sm" variant={next === 'suspended' ? 'danger' : 'secondary'} disabled={pending}>
        {pending ? '…' : next === 'suspended' ? 'Suspend' : 'Reinstate'}
      </Button>
      {state.error ? <p className="mt-1 text-[11px] text-critical">{state.error}</p> : null}
      {state.success ? <p className="mt-1 text-[11px] text-positive">{state.success}</p> : null}
    </form>
  )
}
