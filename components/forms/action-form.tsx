'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert, Button } from '@/components/ui/primitives'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * A thin wrapper over `useActionState` that every mutation form uses, so
 * pending state, error display and success confirmation behave identically
 * across the product instead of being re-implemented per form.
 */
export function ActionForm({
  action, children, submitLabel, className, hideSubmit = false, variant = 'primary', confirm,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  children: React.ReactNode
  submitLabel?: string
  className?: string
  hideSubmit?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  confirm?: string
}) {
  const [state, submit] = useActionState<ActionState, FormData>(action, {})

  return (
    <form
      action={submit}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {children}
      {state.error ? <Alert tone="critical" className="mt-3">{state.error}</Alert> : null}
      {state.success ? <Alert tone="positive" className="mt-3">{state.success}</Alert> : null}
      {hideSubmit ? null : (
        <div className="mt-4">
          <SubmitButton variant={variant}>{submitLabel ?? 'Save'}</SubmitButton>
        </div>
      )}
    </form>
  )
}

export function SubmitButton({
  children, variant = 'primary', size = 'md', className, pendingLabel,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  pendingLabel?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? pendingLabel ?? 'Working…' : children}
    </Button>
  )
}

/** Inline single-button form for a one-shot action with no fields. */
export function InlineAction({
  action, label, hidden, variant = 'secondary', size = 'sm', confirm, pendingLabel, className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  label: string
  hidden: Record<string, string>
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  confirm?: string
  pendingLabel?: string
  className?: string
}) {
  const [state, submit] = useActionState<ActionState, FormData>(action, {})
  return (
    <form
      action={submit}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>{label}</SubmitButton>
      {state.error ? <p className="mt-1.5 text-[11px] text-critical">{state.error}</p> : null}
      {state.success ? <p className="mt-1.5 text-[11px] text-positive">{state.success}</p> : null}
    </form>
  )
}
