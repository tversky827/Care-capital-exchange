'use client'

import { useActionState } from 'react'
import { Alert, Button } from '@/components/ui/primitives'
import { simulateDistributionAction, simulateExitAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * Advancing time.
 *
 * Two buttons that make the hypothesis concrete: what the structure would pay
 * next quarter, and what would come back at the sale. Both are worked out by
 * the same deterministic engines the offering page uses, so what a person sees
 * here cannot disagree with what they read there.
 */
export function Simulate({ positionId, exited }: { positionId: string; exited: boolean }) {
  const [distState, distSubmit, distPending] = useActionState<ActionState, FormData>(simulateDistributionAction, {})
  const [exitState, exitSubmit, exitPending] = useActionState<ActionState, FormData>(simulateExitAction, {})

  if (exited) {
    return (
      <p className="text-[11px] text-ink-muted">
        Exited. The simulated proceeds are in your virtual cash.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={distSubmit}>
          <input type="hidden" name="positionId" value={positionId} />
          <Button type="submit" size="sm" disabled={distPending}>
            {distPending ? 'Working…' : 'Simulate a quarter'}
          </Button>
        </form>
        <form action={exitSubmit}>
          <input type="hidden" name="positionId" value={positionId} />
          <Button type="submit" size="sm" disabled={exitPending}>
            {exitPending ? 'Working…' : 'Simulate the sale'}
          </Button>
        </form>
      </div>
      {distState.error ? <Alert tone="warning">{distState.error}</Alert> : null}
      {distState.success ? <Alert tone="positive">{distState.success}</Alert> : null}
      {exitState.error ? <Alert tone="warning">{exitState.error}</Alert> : null}
      {exitState.success ? <Alert tone="positive">{exitState.success}</Alert> : null}
    </div>
  )
}
