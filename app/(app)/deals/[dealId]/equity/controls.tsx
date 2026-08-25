'use client'

import { useActionState, useState, useTransition } from 'react'
import { Alert, Badge, Button } from '@/components/ui/primitives'
import {
  acceptCommitmentAction, answerQuestionAction, publishOfferingAction, qualityCheckAction,
  recomputeMatchesAction, setStatusAction, submitForReviewAction,
} from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { ComplianceFinding } from '@/types/equity'

/**
 * Sponsor controls for an offering.
 *
 * The order of the buttons is the order of the workflow, and publication is
 * absent unless the viewer is an administrator — a sponsor cannot publish its
 * own securities offering here.
 */
export function OfferingControls({
  offeringId, dealId, status, isAdmin, commitmentId, mode = 'offering',
}: {
  offeringId: string
  dealId: string
  status: string
  isAdmin: boolean
  commitmentId?: string
  mode?: 'offering' | 'commitment'
}) {
  const [reviewState, reviewSubmit, reviewPending] = useActionState<ActionState, FormData>(submitForReviewAction, {})
  const [publishState, publishSubmit, publishPending] = useActionState<ActionState, FormData>(publishOfferingAction, {})
  const [statusState, statusSubmit, statusPending] = useActionState<ActionState, FormData>(setStatusAction, {})
  const [acceptState, acceptSubmit, acceptPending] = useActionState<ActionState, FormData>(acceptCommitmentAction, {})
  const [matchState, matchSubmit, matchPending] = useActionState<ActionState, FormData>(recomputeMatchesAction, {})

  const [check, setCheck] = useState<{ verdict: string; findings: ComplianceFinding[] } | null>(null)
  const [checking, startCheck] = useTransition()

  if (mode === 'commitment') {
    return (
      <form action={acceptSubmit}>
        <input type="hidden" name="commitmentId" value={commitmentId ?? ''} />
        <input type="hidden" name="dealId" value={dealId} />
        {acceptState.error ? <Alert tone="critical" className="mb-1">{acceptState.error}</Alert> : null}
        <Button type="submit" size="sm" variant="primary" disabled={acceptPending}>
          {acceptPending ? 'Accepting…' : 'Accept'}
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={checking}
          onClick={() => startCheck(async () => { setCheck(await qualityCheckAction(offeringId)) })}
        >
          {checking ? 'Checking…' : 'Run completeness check'}
        </Button>

        {status === 'draft' || status === 'under_review' ? (
          <form action={reviewSubmit}>
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="dealId" value={dealId} />
            <Button type="submit" size="sm" disabled={reviewPending}>
              {reviewPending ? 'Submitting…' : 'Submit for review'}
            </Button>
          </form>
        ) : null}

        {isAdmin && ['compliance_review', 'ready', 'paused'].includes(status) ? (
          <form action={publishSubmit}>
            <input type="hidden" name="offeringId" value={offeringId} />
            <Button type="submit" size="sm" variant="primary" disabled={publishPending}>
              {publishPending ? 'Publishing…' : 'Publish to marketplace'}
            </Button>
          </form>
        ) : null}

        {status === 'live' ? (
          <>
            <form action={statusSubmit}>
              <input type="hidden" name="offeringId" value={offeringId} />
              <input type="hidden" name="status" value="paused" />
              <input type="hidden" name="reason" value="Paused by the sponsor." />
              <Button type="submit" size="sm" disabled={statusPending}>Pause</Button>
            </form>
            <form action={matchSubmit}>
              <input type="hidden" name="offeringId" value={offeringId} />
              <input type="hidden" name="dealId" value={dealId} />
              <Button type="submit" size="sm" disabled={matchPending}>
                {matchPending ? 'Scoring…' : 'Recompute matches'}
              </Button>
            </form>
          </>
        ) : null}
      </div>

      {reviewState.error ? <Alert tone="critical">{reviewState.error}</Alert> : null}
      {reviewState.success ? <Alert tone="positive">{reviewState.success}</Alert> : null}
      {publishState.error ? <Alert tone="critical">{publishState.error}</Alert> : null}
      {publishState.success ? <Alert tone="positive">{publishState.success}</Alert> : null}
      {statusState.success ? <Alert tone="positive">{statusState.success}</Alert> : null}
      {matchState.success ? <Alert tone="positive">{matchState.success}</Alert> : null}

      {check ? (
        <div className="space-y-1.5 rounded border border-line p-3">
          <div className="flex items-center gap-2">
            <Badge tone={check.verdict === 'pass' ? 'positive' : check.verdict === 'warnings' ? 'warning' : 'critical'}>
              {check.verdict}
            </Badge>
            <span className="text-[12px] text-ink-muted">
              {check.findings.length === 0 ? 'Nothing outstanding.' : `${check.findings.length} finding${check.findings.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {check.findings.map((finding) => (
            <div key={finding.code} className="text-[12px] leading-relaxed">
              <span className={finding.severity === 'blocker' ? 'font-medium text-red-700' : 'font-medium text-amber-700'}>
                {finding.title}.
              </span>{' '}
              <span className="text-ink-muted">{finding.detail}</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-ink-muted">
            A completeness check, not a legal review. Whether this offering may lawfully be made is
            a question for your counsel.
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Inline reply to an investor question. */
export function QuestionReply({ questionId, dealId }: { questionId: string; dealId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(answerQuestionAction, {})
  return (
    <form action={submit} className="mt-2 space-y-1.5">
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="dealId" value={dealId} />
      <textarea
        name="body"
        rows={2}
        placeholder="Answer this investor…"
        className="w-full border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
      />
      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Sending…' : 'Answer'}</Button>
    </form>
  )
}
