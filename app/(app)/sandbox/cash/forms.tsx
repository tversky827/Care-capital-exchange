'use client'

import { useActionState, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui/primitives'
import { addCashAction, withdrawCashAction, resetSandboxAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

const PRESETS = ['10,000', '25,000', '50,000', '100,000', '250,000', '500,000', '1,000,000']

export function AddVirtualCash() {
  const [state, submit, pending] = useActionState<ActionState, FormData>(addCashAction, {})
  const [amount, setAmount] = useState('')

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <ArrowDownLeft className="size-4 text-positive" />
        <CardTitle>Add virtual cash</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-3">
          <div>
            <label htmlFor="sandbox-add" className="text-[12px] font-medium text-ink">Amount</label>
            <Input
              id="sandbox-add"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="25,000"
              className="mt-1.5 text-[15px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className="rounded border border-line px-2 py-1 text-[12px] text-ink-secondary hover:border-accent hover:text-accent"
              >
                ${preset}
              </button>
            ))}
          </div>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={pending || !amount.trim()}>
            {pending ? 'Adding…' : 'Add virtual cash'}
          </Button>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            This is not connected to a bank, a card or any payment system, and there is no code path
            from here to one. The number goes up; nothing else happens.
          </p>
        </form>
      </CardBody>
    </Card>
  )
}

export function RemoveVirtualCash({ availableLabel }: { availableLabel: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(withdrawCashAction, {})
  const [amount, setAmount] = useState('')

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <ArrowUpRight className="size-4 text-ink-muted" />
        <CardTitle>Remove virtual cash</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-3">
          <div>
            <label htmlFor="sandbox-remove" className="text-[12px] font-medium text-ink">Amount</label>
            <Input
              id="sandbox-remove"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="5,000"
              className="mt-1.5 text-[15px]"
            />
            <p className="mt-1 text-[11px] text-ink-muted">{availableLabel} available</p>
          </div>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <Button type="submit" className="w-full" disabled={pending || !amount.trim()}>
            {pending ? 'Removing…' : 'Remove'}
          </Button>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Here so the balance can be brought down to practise against a smaller one. It goes
            nowhere, because it was never anywhere.
          </p>
        </form>
      </CardBody>
    </Card>
  )
}

/**
 * Starting over.
 *
 * Two presses, because one press that erases a portfolio somebody spent twenty
 * minutes building is a press they will make by accident.
 */
export function ResetSandbox({ holdings, cashLabel }: { holdings: number; cashLabel: string }) {
  const [armed, setArmed] = useState(false)

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <RotateCcw className="size-4 text-ink-muted" />
        <CardTitle>Start over</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {armed ? (
          <>
            <Alert tone="warning" title="This clears the portfolio">
              {holdings} holding{holdings === 1 ? '' : 's'} and {cashLabel} of virtual cash will be
              cleared, and the account will reopen with its starting balance. What was here is kept
              in the history rather than deleted, so you can still see what you had.
            </Alert>
            <div className="flex gap-2">
              <form action={resetSandboxAction} className="flex-1">
                <Button type="submit" variant="danger" className="w-full">Yes, clear it</Button>
              </form>
              <Button type="button" className="flex-1" onClick={() => setArmed(false)}>Keep it</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] leading-relaxed text-ink-secondary">
              Clears every practice holding and restores the starting virtual balance. Useful before
              showing the product to someone, or to try a different approach from scratch.
            </p>
            <Button type="button" className="w-full" onClick={() => setArmed(true)}>
              Reset this account
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  )
}
