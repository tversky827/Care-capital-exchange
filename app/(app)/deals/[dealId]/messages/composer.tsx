'use client'

import { useActionState, useRef, useState } from 'react'
import { Alert, Button, Card, CardBody, Field, Input, Textarea } from '@/components/ui/primitives'
import { postMessageAction, type ActionState } from '../../actions'

export function MessageComposer({ dealId, threadId }: { dealId: string; threadId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(postMessageAction, {})
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={(formData) => {
        submit(formData)
        formRef.current?.reset()
      }}
      className="space-y-2"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="threadId" value={threadId} />
      <Textarea name="body" rows={2} placeholder="Write a reply…" required aria-label="Reply" />
      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
      <Button type="submit" size="sm" variant="primary" disabled={pending}>
        {pending ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  )
}

export function NewThread({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<ActionState, FormData>(postMessageAction, {})

  if (!open) {
    return <Button size="sm" onClick={() => setOpen(true)}>Start a thread</Button>
  }

  return (
    <Card className="w-full max-w-lg">
      <CardBody>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="dealId" value={dealId} />
          <Field label="Subject" htmlFor="subject">
            <Input id="subject" name="subject" required placeholder="e.g. Agency labor detail" />
          </Field>
          <Field label="Message" htmlFor="body">
            <Textarea id="body" name="body" rows={3} required />
          </Field>
          {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={pending}>
              {pending ? 'Sending…' : 'Start thread'}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
