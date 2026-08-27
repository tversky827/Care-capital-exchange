'use client'

import { useActionState, useState, useTransition } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import {
  Alert, Button, CardBody, Input, Section,
} from '@/components/ui/primitives'
import { askOfferingAction, askQuestionAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { InvestorAnswer, InvestorQuestion } from '@/types/equity'

/**
 * Questions, in one place.
 *
 * Three separate panels used to live here: one that asked the deal record, one
 * that sent a question to the sponsor, and one that listed questions worth
 * asking. Having them apart made an investor choose a *mechanism* before they
 * had a question. Now there is one box: the record answers instantly if it can,
 * and the same question goes to the sponsor if the investor wants a human to
 * answer it.
 *
 * Answers from the record carry citations to the documents behind them. A
 * question the record cannot answer is told so plainly — an investor who learns
 * the record is silent on something has learned something true, and an invented
 * answer would be worse than none.
 */
export function AskPanel({
  offeringId, offeringName, suggestions, answered,
}: {
  offeringId: string
  offeringName: string
  suggestions: readonly string[]
  answered: { question: InvestorQuestion; answers: InvestorAnswer[] }[]
}) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof askOfferingAction>>>(null)
  const [pending, start] = useTransition()
  const [sponsorState, sponsorSubmit, sponsorPending] = useActionState<ActionState, FormData>(askQuestionAction, {})

  const ask = (value: string) => {
    if (!value.trim()) return
    setQuestion(value)
    start(async () => { setAnswer(await askOfferingAction(offeringId, value)) })
  }

  return (
    <Section
      title="Questions"
      description={`Ask anything about ${offeringName}. The deal record answers straight away; the sponsor answers the rest.`}
    >
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

        {answer ? null : (
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
        )}

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

            {/* Same question, sent to a person. */}
            <form action={sponsorSubmit} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <input type="hidden" name="offeringId" value={offeringId} />
              <input type="hidden" name="body" value={question} />
              <span className="text-[12px] text-ink-muted">Want the sponsor&rsquo;s own answer?</span>
              <Button type="submit" size="sm" disabled={sponsorPending || !question.trim()}>
                {sponsorPending ? 'Sending…' : 'Send this to the sponsor'}
              </Button>
            </form>
            {sponsorState.error ? <Alert tone="critical">{sponsorState.error}</Alert> : null}
            {sponsorState.success ? <Alert tone="positive">{sponsorState.success}</Alert> : null}
          </div>
        ) : null}

        {answered.length > 0 ? (
          <div className="space-y-3 border-t border-line pt-3">
            <h4 className="text-[12px] font-semibold text-ink">Already answered by the sponsor</h4>
            {answered.map(({ question: asked, answers }) => (
              <div key={asked.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                <p className="text-[13px] text-ink">{asked.body}</p>
                {answers.map((given) => (
                  <p key={given.id} className="mt-1.5 border-l-2 border-line pl-3 text-[12px] text-ink-secondary">
                    {given.body}
                  </p>
                ))}
                {answers.length === 0 ? (
                  <p className="mt-1 text-[11px] text-ink-muted">Awaiting a response from the sponsor.</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Section>
  )
}
