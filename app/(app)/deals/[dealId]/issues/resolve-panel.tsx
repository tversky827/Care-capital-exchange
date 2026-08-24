'use client'

import { useActionState, useState } from 'react'
import { Alert, Button, Select, Textarea } from '@/components/ui/primitives'
import { resolveDiscrepancyAction, type ActionState } from '../../actions'

export function ResolvePanel({
  dealId, discrepancyId, values,
}: {
  dealId: string
  discrepancyId: string
  values: string[]
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(resolveDiscrepancyAction, {})
  const [action, setAction] = useState<'resolve' | 'ignore' | 'request_clarification'>('resolve')

  if (state.success) return <Alert tone="positive">{state.success}</Alert>

  return (
    <form action={submit} className="border-t border-line pt-4">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="discrepancyId" value={discrepancyId} />

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Action</span>
            <Select
              name="action"
              value={action}
              onChange={(event) => setAction(event.target.value as typeof action)}
            >
              <option value="resolve">Resolve</option>
              <option value="ignore">Ignore</option>
              <option value="request_clarification">Request clarification</option>
            </Select>
          </label>

          {action === 'resolve' && values.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Figure of record</span>
              <Select name="acceptedValue" defaultValue="">
                <option value="">Not applicable</option>
                {[...new Set(values)].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
            {action === 'ignore' ? 'Why is this not a concern?' : 'Explanation'}
          </span>
          <Textarea
            name="note"
            rows={3}
            required
            placeholder={
              action === 'resolve'
                ? 'e.g. The tax return is on a cash basis; the operating statements are accrual and are the figure of record.'
                : action === 'ignore'
                  ? 'e.g. The variance is immaterial at this transaction size.'
                  : 'e.g. Awaiting the monthly agency detail from the operator.'
            }
          />
        </label>
      </div>

      {state.error ? <Alert tone="critical" className="mt-3">{state.error}</Alert> : null}

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : action === 'resolve' ? 'Resolve item' : action === 'ignore' ? 'Ignore item' : 'Request clarification'}
        </Button>
        <span className="text-[11px] text-ink-muted">
          The note is recorded in the audit log and is visible to your deal team.
        </span>
      </div>
    </form>
  )
}
