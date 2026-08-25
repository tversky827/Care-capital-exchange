'use client'

import { useState, useTransition } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui/primitives'
import { askOfferingAction } from './actions'

/**
 * Ask the offering.
 *
 * Answers come from the deal record with citations to the documents behind
 * them. A question the record cannot answer is told so plainly — an investor
 * who learns the record is silent on something has learned something true, and
 * an invented answer would be worse than none.
 */
export function AskPanel({
  offeringId, suggestions,
}: {
  offeringId: string
  suggestions: readonly string[]
}) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof askOfferingAction>>>(null)
  const [pending, start] = useTransition()

  const ask = (value: string) => {
    if (!value.trim()) return
    setQuestion(value)
    start(async () => { setAnswer(await askOfferingAction(offeringId, value)) })
  }

  return (
    <Card>
      <CardHeader><CardTitle>Ask about this investment</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') ask(question) }}
            placeholder="What drives the exit valuation?"
          />
          <Button type="button" variant="primary" disabled={pending || !question.trim()} onClick={() => ask(question)}>
            {pending ? '…' : 'Ask'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 5).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => ask(suggestion)}
              className="rounded border border-line px-2 py-1 text-left text-[11px] text-ink-muted hover:border-accent hover:text-accent"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {answer ? (
          <div className="space-y-2 border-t border-line pt-3">
            {answer.insufficient_information ? (
              <Alert tone="warning">{answer.answer}</Alert>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-secondary">{answer.answer}</p>
            )}
            {answer.citations.length > 0 ? (
              <div className="space-y-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Sources</h4>
                {answer.citations.map((citation, index) => (
                  <p key={`${citation.label}-${index}`} className="text-[11px] text-ink-muted">
                    <span className="text-ink-secondary">{citation.label}</span>
                    {citation.page ? `, page ${citation.page}` : ''}
                    {citation.quote ? ` — “${citation.quote}”` : ''}
                  </p>
                ))}
              </div>
            ) : null}
            <p className="flex items-start gap-1 text-[11px] leading-relaxed text-ink-muted">
              <MessageCircleQuestion className="mt-0.5 size-3 shrink-0" />
              Answers are assembled from this deal&rsquo;s own record. They are not investment
              advice, and they are not a substitute for reading the offering documents.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
