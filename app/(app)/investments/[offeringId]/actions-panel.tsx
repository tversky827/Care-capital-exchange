'use client'

import { useActionState, useState, useTransition } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle, Input,
} from '@/components/ui/primitives'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'
import { acknowledgeAction, calculateAction, commitAction, expressInterestAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { EligibilityResult } from '@/lib/equity/eligibility'

/**
 * The investor's action panel.
 *
 * One amount, one step at a time. This replaced three separate panels that each
 * had their own amount field — one to register interest, one to model a return,
 * one to commit — which made an investor type the same number three times and
 * left it genuinely unclear which button spent money. (None of them do.)
 *
 * The sequence the service layer actually enforces is interest first, then a
 * commitment, so that is the sequence the panel shows: step two does not appear
 * until step one has happened. Modelling a return is a calculation attached to
 * the amount, not a fourth thing to decide about.
 *
 * Committing and calculating remain distinct presses. Pressing one must never
 * perform the other.
 */
export function InvestorActions({
  offeringId, minimum, maximum, eligibility, isInvestor, status, hasInterest, committed,
}: {
  offeringId: string
  minimum: number | null
  maximum: number | null
  eligibility: EligibilityResult | null
  isInvestor: boolean
  status: string
  /** Whether this investor has already registered interest. */
  hasInterest: boolean
  /** What they have already committed, if anything. */
  committed: number | null
}) {
  const [amount, setAmount] = useState(minimum ? String(minimum) : '')
  const [interestState, interestSubmit, interestPending] = useActionState<ActionState, FormData>(expressInterestAction, {})
  const [ackState, ackSubmit, ackPending] = useActionState<ActionState, FormData>(acknowledgeAction, {})
  const [commitState, commitSubmit, commitPending] = useActionState<ActionState, FormData>(commitAction, {})
  const [acknowledged, setAcknowledged] = useState(false)

  if (!isInvestor) {
    return (
      <Card>
        <CardHeader><CardTitle>Want to invest?</CardTitle></CardHeader>
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            You are signed in with an account that is not set up for investing. Investing needs an
            investor account that has been through onboarding.
          </p>
        </CardBody>
      </Card>
    )
  }

  if (committed !== null) {
    return (
      <Card>
        <CardHeader><CardTitle>You are in</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          <p className="tnum text-[20px] font-semibold text-ink">{formatCurrency(committed)}</p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Committed and sent to the sponsor. They will be in touch to complete the paperwork. No
            money has moved through CareCapital Exchange.
          </p>
        </CardBody>
      </Card>
    )
  }

  // The disclosure requirement is what the checkbox below satisfies, so listing
  // it as an obstacle above the checkbox that clears it reads as two problems.
  const unmet = eligibility?.requirements.filter((r) => !r.satisfied && r.key !== 'disclosures') ?? []
  const blocked = eligibility?.verdict === 'not_eligible'
  const canCommit = eligibility?.verdict === 'eligible' && status === 'live' && acknowledged
  const registered = hasInterest || Boolean(interestState.success)

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle>{status === 'live' ? 'Invest in this' : 'This raise is closed'}</CardTitle>
      </CardHeader>

      <CardBody className="space-y-4">
        {status !== 'live' ? (
          <p className="text-[13px] text-ink-secondary">
            It is no longer taking commitments. You can still read everything on this page.
          </p>
        ) : (
          <>
            {/* ---- one amount, used by everything below --------------------- */}
            <div>
              <label htmlFor="amount" className="text-[12px] font-medium text-ink">
                How much are you thinking?
              </label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={minimum ? formatCurrency(minimum) : '100,000'}
                className="mt-1.5 text-[15px]"
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                {minimum ? `${formatCurrency(minimum)} minimum` : 'No stated minimum'}
                {maximum ? ` · ${formatCurrency(maximum)} maximum` : ''}
              </p>
            </div>

            <Projection offeringId={offeringId} amount={amount} />

            {/* ---- step one: register interest ------------------------------ */}
            {registered ? (
              <p className="flex items-start gap-1.5 border-t border-line pt-3 text-[12px] text-ink-secondary">
                <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
                The sponsor knows you are interested. Nothing is committed yet.
              </p>
            ) : (
              <form action={interestSubmit} className="space-y-2 border-t border-line pt-3">
                <input type="hidden" name="offeringId" value={offeringId} />
                <input type="hidden" name="indicatedAmount" value={amount} />
                {interestState.error ? <Alert tone="critical">{interestState.error}</Alert> : null}
                <Button type="submit" variant="primary" className="w-full" disabled={interestPending}>
                  {interestPending ? 'Sending…' : 'Tell the sponsor I am interested'}
                </Button>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Nothing is committed and no money moves. It puts you on the sponsor&rsquo;s list and
                  opens the next step.
                </p>
              </form>
            )}

            {/* ---- what still stands in the way ----------------------------- */}
            {registered && unmet.length > 0 ? (
              <div className="border-t border-line pt-3">
                <p className="text-[12px] font-medium text-ink">Before you can commit</p>
                <ul className="mt-2 space-y-2">
                  {unmet.map((requirement) => (
                    <li key={requirement.key} className="text-[12px] leading-relaxed">
                      <span className="flex items-start gap-1.5 font-medium text-ink">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                        {requirement.label}
                      </span>
                      <span className="mt-0.5 block pl-4 text-ink-muted">{requirement.reason}</span>
                      {requirement.action ? (
                        <span className="mt-0.5 block pl-4 text-accent">{requirement.action}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ---- step two: commit ----------------------------------------- */}
            {registered && !blocked ? (
              <div className="space-y-2 border-t border-line pt-3">
                <form action={ackSubmit}>
                  <input type="hidden" name="offeringId" value={offeringId} />
                  <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => {
                        setAcknowledged(event.target.checked)
                        // The acknowledgement is evidentiary, so it is recorded
                        // when it is given rather than when the commitment is
                        // sent — the record has to survive an abandoned commit.
                        if (event.target.checked) event.currentTarget.form?.requestSubmit()
                      }}
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>
                      I have read the risks. I understand this is illiquid, that projected returns
                      are not promises, and that I could lose everything I put in.
                    </span>
                  </label>
                  {ackState.error ? <Alert tone="critical" className="mt-2">{ackState.error}</Alert> : null}
                  {ackPending ? <p className="mt-1 text-[11px] text-ink-muted">Recording…</p> : null}
                </form>

                <form action={commitSubmit} className="space-y-2">
                  <input type="hidden" name="offeringId" value={offeringId} />
                  <input type="hidden" name="amount" value={amount} />
                  {commitState.error ? <Alert tone="critical">{commitState.error}</Alert> : null}
                  {commitState.success ? <Alert tone="positive">{commitState.success}</Alert> : null}
                  <Button type="submit" variant="primary" className="w-full" disabled={!canCommit || commitPending}>
                    {commitPending ? 'Recording…' : `Commit ${formatCurrency(parseAmount(amount)) || 'this amount'}`}
                  </Button>
                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    A commitment tells the sponsor what you intend to invest. It is not a purchase of
                    securities, and no money moves through CareCapital Exchange.
                  </p>
                </form>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function parseAmount(raw: string): number | null {
  const parsed = Number(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * What the amount in the field would be projected to return.
 *
 * A calculation, on an explicit press, that commits nothing. It reads the same
 * field as the commitment above it so an investor works with one number.
 */
function Projection({ offeringId, amount }: { offeringId: string; amount: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof calculateAction>> | null>(null)
  const [shownFor, setShownFor] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const parsed = parseAmount(amount)
  const stale = result !== null && shownFor !== parsed

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full"
        disabled={pending || parsed === null}
        onClick={() => startTransition(async () => {
          if (parsed === null) return
          setResult(await calculateAction(offeringId, parsed))
          setShownFor(parsed)
        })}
      >
        {pending ? 'Working it out…' : result ? 'Recalculate' : 'What could this return?'}
      </Button>

      {result?.insufficientData ? (
        <Alert tone="warning">{result.insufficientData}</Alert>
      ) : result ? (
        <div className="space-y-1.5 rounded border border-line bg-surface-sunken p-3 text-[12px]">
          {stale ? (
            <p className="pb-1 text-[11px] text-warning">
              For {formatCurrency(shownFor)}, not the amount now in the box.
            </p>
          ) : null}
          <Row label="You would own" value={formatPercent((result.ownershipPct ?? 0) * 100)} />
          <Row label="Paid out over the hold" value={formatCurrency(result.projectedDistributions)} />
          <Row label="Paid out at sale" value={formatCurrency(result.projectedExitProceeds)} />
          <div className="border-t border-line pt-1.5">
            <Row label="Total back" value={formatCurrency(result.projectedTotal)} strong />
            <Row label="On every dollar in" value={formatRatio(result.projectedMultiple)} />
            <Row label="A year, compounded" value={formatPercent(result.projectedIrrPct)} />
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
            Projected from the sponsor&rsquo;s stated assumptions. Not a forecast, not a promise, and
            not advice. Fees reduce these amounts.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <span className={`tnum ${strong ? 'text-[14px] font-semibold text-ink' : 'font-medium text-ink'}`}>{value}</span>
    </div>
  )
}
