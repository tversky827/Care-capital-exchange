'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Send } from 'lucide-react'
import { Alert, Badge, Button, Card, CardBody, Textarea } from '@/components/ui/primitives'
import { askDealAction, type AskState } from '../../actions'

export function AskPanel({ dealId, suggestions }: { dealId: string; suggestions: string[] }) {
  const [state, submit, pending] = useActionState<AskState, FormData>(askDealAction, {})
  const [question, setQuestion] = useState('')

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form action={submit} className="space-y-3">
            <input type="hidden" name="dealId" value={dealId} />
            <Textarea
              name="question"
              rows={3}
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What caused EBITDA to change year over year?"
              aria-label="Your question"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="sm" className="gap-1.5" disabled={pending}>
                <Send className="size-3.5" /> {pending ? 'Thinking…' : 'Ask'}
              </Button>
              <span className="text-[11px] text-ink-muted">
                Answers are grounded in this deal&apos;s records and cite their sources.
              </span>
            </div>
          </form>

          <div className="mt-4 border-t border-line pt-3">
            <p className="eyebrow mb-2">Try asking</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuestion(suggestion)}
                  className="border border-line px-2.5 py-1 text-left text-[12px] text-ink-secondary transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-accent rounded-[3px]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}

      {state.answer ? (
        <Card>
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-[12px] font-medium text-ink-secondary">{state.question}</p>
          </div>
          <CardBody>
            {state.insufficient ? (
              <Badge tone="warning" className="mb-2">Insufficient information on the deal record</Badge>
            ) : null}
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">
              {state.answer}
            </div>

            {state.citations && state.citations.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="eyebrow mb-1.5">Sources</p>
                <ul className="space-y-1">
                  {state.citations.map((citation, index) => (
                    <li key={`${citation.label}-${index}`} className="text-[12px]">
                      {citation.document_id ? (
                        <Link
                          href={`/api/documents/${citation.document_id}/download?disposition=inline`}
                          target="_blank"
                          className="text-accent hover:underline"
                        >
                          {citation.label}{citation.page ? `, page ${citation.page}` : ''}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">{citation.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
