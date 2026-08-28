'use client'

import { useActionState, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui/primitives'
import { depositAction, withdrawAction } from '../money-actions'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * Adding and taking out cash.
 *
 * Two forms rather than a mode switch: an investor arriving to move money in
 * one direction should not have to notice a toggle first, and the two are
 * different enough — one is instant, one takes days — that sharing a control
 * would flatten the difference.
 *
 * The amount is a string all the way to the server, which parses it. Nothing
 * here computes cents, because a client that computes the amount is a client
 * that can compute a different one.
 */

const PRESETS = ['10,000', '25,000', '50,000', '100,000']

export function AddFunds({ demo }: { demo: boolean }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(depositAction, {})
  const [amount, setAmount] = useState('')

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <ArrowDownLeft className="size-4 text-positive" />
        <CardTitle>Add funds</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-3">
          <div>
            <label htmlFor="deposit-amount" className="text-[12px] font-medium text-ink">Amount</label>
            <Input
              id="deposit-amount"
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
            {pending ? 'Adding…' : 'Add funds'}
          </Button>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {demo
              ? 'Demonstration only. No bank is contacted and no real money moves — the balance is recorded in this environment and nowhere else.'
              : 'Funds clear in one to three business days. Uncleared money cannot be invested until it settles.'}
          </p>
        </form>
      </CardBody>
    </Card>
  )
}

export function Withdraw({ availableLabel }: { availableLabel: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(withdrawAction, {})
  const [amount, setAmount] = useState('')

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <ArrowUpRight className="size-4 text-ink-muted" />
        <CardTitle>Withdraw</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={submit} className="space-y-3">
          <div>
            <label htmlFor="withdraw-amount" className="text-[12px] font-medium text-ink">Amount</label>
            <Input
              id="withdraw-amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="5,000"
              className="mt-1.5 text-[15px]"
            />
            <p className="mt-1 text-[11px] text-ink-muted">{availableLabel} available to withdraw</p>
          </div>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <Button type="submit" className="w-full" disabled={pending || !amount.trim()}>
            {pending ? 'Requesting…' : 'Request withdrawal'}
          </Button>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Money committed to an investment that has not settled cannot be withdrawn. It is held
            out of the figure above until the investment completes or is cancelled.
          </p>
        </form>
      </CardBody>
    </Card>
  )
}
