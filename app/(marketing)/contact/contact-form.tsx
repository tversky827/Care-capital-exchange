'use client'

import { useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'

/**
 * The contact form validates and acknowledges locally. There is no inbox
 * configured in this environment, and pretending a message was delivered when
 * it was not would be worse than saying so.
 */
export function ContactForm() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (submitted) {
    return (
      <Alert tone="positive" title="Message captured">
        No mail transport is configured in this demonstration environment, so nothing was sent. In a
        configured deployment this would reach the routing address for your enquiry type.
      </Alert>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const email = String(data.get('email') ?? '')
        const message = String(data.get('message') ?? '')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError('Enter a valid email address.')
          return
        }
        if (message.trim().length < 20) {
          setError('Tell us a little more — at least a couple of sentences.')
          return
        }
        setError(null)
        setSubmitted(true)
      }}
    >
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required autoComplete="name" />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Organisation" htmlFor="organisation">
        <Input id="organisation" name="organisation" autoComplete="organization" />
      </Field>
      <Field label="I am" htmlFor="role">
        <Select id="role" name="role" defaultValue="borrower">
          <option value="borrower">An operator seeking financing</option>
          <option value="lender">A lending institution</option>
          <option value="broker">A broker or advisor</option>
          <option value="other">Something else</option>
        </Select>
      </Field>
      <Field label="How can we help?" htmlFor="message">
        <Textarea id="message" name="message" rows={5} required />
      </Field>
      {error ? <Alert tone="critical">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full">Send message</Button>
    </form>
  )
}
