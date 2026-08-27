'use client'

import { useActionState, useState } from 'react'
import { Lock } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui/primitives'
import { acceptNdaAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { NdaText } from '@/lib/equity/nda'

/**
 * The confidentiality agreement, shown in place of the offering's detail.
 *
 * The full text is on the page rather than behind a link or in a scroll box.
 * A person cannot agree to words they were not shown, and a tick box beside a
 * link is a way of not showing them.
 *
 * The signature is a typed name rather than a bare checkbox, for the same
 * reason a signature is a name anywhere else: it makes the act deliberate, and
 * it is what the record has to hold if the agreement is ever relied on.
 */
export function NdaGate({ offeringId, nda }: { offeringId: string; nda: NdaText }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(acceptNdaAction, {})
  const [name, setName] = useState('')

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Lock className="size-4 text-ink-muted" />
        <CardTitle>{nda.title}</CardTitle>
      </CardHeader>

      <CardBody className="space-y-5">
        <p className="text-[13px] leading-relaxed text-ink-secondary">{nda.preamble}</p>

        <div className="space-y-4 border-y border-line py-4">
          {nda.clauses.map((clause, index) => (
            <div key={clause.heading}>
              <h3 className="text-[13px] font-semibold text-ink">
                <span className="tnum mr-1.5 text-ink-muted">{index + 1}.</span>
                {clause.heading}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{clause.body}</p>
            </div>
          ))}
        </div>

        <form action={submit} className="space-y-3">
          <input type="hidden" name="offeringId" value={offeringId} />
          <p className="text-[13px] leading-relaxed text-ink">{nda.attestation}</p>
          <div className="max-w-sm">
            <label htmlFor="signedName" className="text-[12px] font-medium text-ink">
              Type your full name to sign
            </label>
            <Input
              id="signedName"
              name="signedName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="mt-1.5"
            />
          </div>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
            {pending ? 'Signing…' : 'Sign and view this investment'}
          </Button>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Signing records your name, your organisation, the version of this agreement and the time.
            It does not commit you to invest and costs nothing.
          </p>
        </form>
      </CardBody>
    </Card>
  )
}
