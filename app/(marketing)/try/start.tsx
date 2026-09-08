'use client'

import { useState, useTransition } from 'react'
import { ArrowRight } from 'lucide-react'
import { Alert, Button } from '@/components/ui/primitives'
import { startDemoAction } from './actions'

/**
 * One press, no form.
 *
 * Everything else on this page is explanation; this is the whole interaction.
 * It is deliberately not a link — a GET that creates an account is a GET a
 * crawler will make.
 */
export function StartDemo() {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full gap-2 sm:w-auto"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null)
          const result = await startDemoAction()
          if (result?.error) setError(result.error)
        })}
      >
        {pending ? 'Setting it up…' : 'Start the demo'}
        {pending ? null : <ArrowRight className="size-4" />}
      </Button>
      {error ? <Alert tone="warning">{error}</Alert> : null}
    </div>
  )
}
