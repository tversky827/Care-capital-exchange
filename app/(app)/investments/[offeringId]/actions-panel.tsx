'use client'

import { useActionState, useState, useTransition } from 'react'
import { AlertTriangle, Check, TrendingDown } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input,
} from '@/components/ui/primitives'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import {
  acknowledgeAction, askQuestionAction, bearCaseAction, calculateAction, commitAction,
  expressInterestAction,
} from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { EligibilityResult } from '@/lib/equity/eligibility'
import type { BearCasePayload } from '@/lib/ai/schemas'
import type { ScenarioResults } from '@/types/equity'

/**
 * The investor's action rail.
 *
 * Deliberately sequential: express interest, acknowledge what you have been
 * asked to read, then commit. Each step unlocks the next, and the eligibility
 * requirements are shown as a checklist so nothing is refused without saying
 * why or what to do about it.
 *
 * The calculator is separate from the commitment. Modelling an amount and
 * committing it are different acts, and pressing one must never perform the
 * other.
 */
export function InvestorActions({
  offeringId, offeringName, minimum, eligibility, isInvestor, status,
}: {
  offeringId: string
  offeringName: string
  minimum: number | null
  eligibility: EligibilityResult | null
  isInvestor: boolean
  status: string
}) {
  const [interestState, interestSubmit, interestPending] = useActionState<ActionState, FormData>(expressInterestAction, {})
  const [ackState, ackSubmit, ackPending] = useActionState<ActionState, FormData>(acknowledgeAction, {})
  const [commitState, commitSubmit, commitPending] = useActionState<ActionState, FormData>(commitAction, {})
  const [questionState, questionSubmit, questionPending] = useActionState<ActionState, FormData>(askQuestionAction, {})

  if (!isInvestor) {
    return (
      <Card>
        <CardHeader><CardTitle>Investing</CardTitle></CardHeader>
        <CardBody>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            You are viewing this offering with a non-investor account. Investing requires an
            investor account that has completed onboarding and verification.
          </p>
        </CardBody>
      </Card>
    )
  }

  const unmet = eligibility?.requirements.filter((r) => !r.satisfied) ?? []
  const canCommit = eligibility?.verdict === 'eligible' && status === 'live'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Your position on this offering</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          {eligibility ? (
            <Alert
              tone={
                eligibility.verdict === 'eligible' ? 'positive'
                  : eligibility.verdict === 'not_eligible' ? 'critical' : 'warning'
              }
            >
              {eligibility.summary}
            </Alert>
          ) : null}

          {unmet.length > 0 ? (
            <ul className="space-y-2">
              {unmet.map((requirement) => (
                <li key={requirement.key} className="text-[12px] leading-relaxed">
                  <span className="flex items-start gap-1.5 font-medium text-ink">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
                    {requirement.label}
                  </span>
                  <span className="mt-0.5 block pl-4 text-ink-muted">{requirement.reason}</span>
                  {requirement.action ? (
                    <span className="mt-0.5 block pl-4 text-accent">{requirement.action}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : eligibility ? (
            <p className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
              <Check className="size-3.5 text-emerald-600" /> Every stated requirement is met.
            </p>
          ) : null}

          <form action={interestSubmit} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="offeringId" value={offeringId} />
            <Field label="Amount you are considering" htmlFor="indicatedAmount" hint="Indicative only. Nothing is committed by this.">
              <Input id="indicatedAmount" name="indicatedAmount" inputMode="numeric" placeholder={minimum ? formatCurrency(minimum) : '$100,000'} />
            </Field>
            {interestState.error ? <Alert tone="critical">{interestState.error}</Alert> : null}
            {interestState.success ? <Alert tone="positive">{interestState.success}</Alert> : null}
            <Button type="submit" variant="secondary" className="w-full" disabled={interestPending}>
              {interestPending ? 'Registering…' : 'Express interest'}
            </Button>
          </form>

          <form action={ackSubmit}>
            <input type="hidden" name="offeringId" value={offeringId} />
            {ackState.error ? <Alert tone="critical" className="mb-2">{ackState.error}</Alert> : null}
            {ackState.success ? <Alert tone="positive" className="mb-2">{ackState.success}</Alert> : null}
            <Button type="submit" className="w-full" disabled={ackPending}>
              {ackPending ? 'Recording…' : 'Acknowledge risk disclosures'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Calculator offeringId={offeringId} minimum={minimum} />

      <Card>
        <CardHeader><CardTitle>Commit</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          <form action={commitSubmit} className="space-y-2">
            <input type="hidden" name="offeringId" value={offeringId} />
            <Field label="Commitment amount" htmlFor="amount">
              <Input id="amount" name="amount" inputMode="numeric" disabled={!canCommit} placeholder={minimum ? formatCurrency(minimum) : ''} />
            </Field>
            {commitState.error ? <Alert tone="critical">{commitState.error}</Alert> : null}
            {commitState.success ? <Alert tone="positive">{commitState.success}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={!canCommit || commitPending}>
              {commitPending ? 'Recording…' : 'Submit commitment'}
            </Button>
          </form>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            A commitment records your intention and sends it to the sponsor. It is not a purchase of
            securities, and no money moves through CareCapital Exchange.
          </p>
        </CardBody>
      </Card>

      <BearCase offeringId={offeringId} />

      <Card>
        <CardHeader><CardTitle>Ask the sponsor</CardTitle></CardHeader>
        <CardBody>
          <form action={questionSubmit} className="space-y-2">
            <input type="hidden" name="offeringId" value={offeringId} />
            <textarea
              name="body"
              rows={3}
              placeholder={`What would you like to know about ${offeringName}?`}
              className="w-full border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
            {questionState.error ? <Alert tone="critical">{questionState.error}</Alert> : null}
            {questionState.success ? <Alert tone="positive">{questionState.success}</Alert> : null}
            <Button type="submit" className="w-full" disabled={questionPending}>
              {questionPending ? 'Sending…' : 'Send question'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

/** Models an amount against the offering's projection. Computes only. */
function Calculator({ offeringId, minimum }: { offeringId: string; minimum: number | null }) {
  const [amount, setAmount] = useState(minimum ? String(minimum) : '')
  const [result, setResult] = useState<Awaited<ReturnType<typeof calculateAction>> | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader><CardTitle>What an amount would buy</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <Field label="Investment amount" htmlFor="calc-amount">
          <Input
            id="calc-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="100000"
          />
        </Field>
        <Button
          type="button"
          className="w-full"
          disabled={pending || !amount}
          onClick={() => startTransition(async () => {
            const parsed = Number(amount.replace(/[^0-9.]/g, ''))
            if (!Number.isFinite(parsed) || parsed <= 0) return
            setResult(await calculateAction(offeringId, parsed))
          })}
        >
          {pending ? 'Calculating…' : 'Calculate'}
        </Button>

        {result?.insufficientData ? (
          <Alert tone="warning">{result.insufficientData}</Alert>
        ) : result ? (
          <div className="space-y-1.5 border-t border-line pt-3 text-[12px]">
            <Row label="Ownership of this offering" value={formatPercent((result.ownershipPct ?? 0) * 100)} />
            <Row label="Projected distributions" value={formatCurrency(result.projectedDistributions)} projected />
            <Row label="Projected exit proceeds" value={formatCurrency(result.projectedExitProceeds)} projected />
            <Row label="Projected total returned" value={formatCurrency(result.projectedTotal)} projected />
            <Row label="Projected equity multiple" value={formatRatio(result.projectedMultiple)} projected />
            <Row label="Projected IRR" value={formatPercent(result.projectedIrrPct)} projected />
            <p className="pt-1.5 text-[11px] leading-relaxed text-ink-muted">
              Projected from the sponsor&rsquo;s stated assumptions. Not a forecast, not a promise,
              and not advice. Fees reduce these amounts.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

/** The downside case, on demand. */
function BearCase({ offeringId }: { offeringId: string }) {
  const [data, setData] = useState<{ results: ScenarioResults; narrative: BearCasePayload } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader><CardTitle>The bear case</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <Button
          type="button"
          className="w-full gap-1.5"
          disabled={pending}
          onClick={() => startTransition(async () => { setData(await bearCaseAction(offeringId)) })}
        >
          <TrendingDown className="size-3.5" />
          {pending ? 'Modelling…' : 'Show me the bear case'}
        </Button>

        {data ? (
          <div className="space-y-3">
            {data.results.insufficient_data ? (
              <Alert tone="warning">{data.results.insufficient_data}</Alert>
            ) : (
              <div className="space-y-1.5 border-t border-line pt-3 text-[12px]">
                <Row label="DSCR" value={formatRatio(data.results.dscr)} />
                <Row label="Cash to equity, year 1" value={formatCurrency(data.results.cash_flow_to_equity)} />
                <Row label="Projected IRR" value={formatPercent(data.results.irr_pct)} projected />
                <Row label="Projected multiple" value={formatRatio(data.results.equity_multiple)} projected />
              </div>
            )}
            <p className="text-[12px] leading-relaxed text-ink-secondary">{data.narrative.narrative}</p>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">What drives it</h4>
              <ul className="mt-1.5 space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
                {data.narrative.drivers.map((driver) => (
                  <li key={driver.label}>
                    <span className="font-medium text-ink-secondary">{driver.label}.</span> {driver.detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

function Row({ label, value, projected }: { label: string; value: string; projected?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-ink-muted">
        {label}
        {projected ? <Badge tone="neutral">Projected</Badge> : null}
      </span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  )
}
