'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle, Input,
} from '@/components/ui/primitives'
import { format, formatWhole, parseAmount, type Cents } from '@/lib/money'
import { formatPercent, formatRatio } from '@/lib/utils/format'
import { placeOrderAction, confirmOrderAction } from '@/app/(app)/investor/money-actions'
import { calculateAction, expressInterestAction, withdrawInterestAction } from './actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { EligibilityResult } from '@/lib/equity/eligibility'

/**
 * The investment ticket.
 *
 * Placing an order, in the shape a brokerage order takes: an amount, what it
 * would leave, what it is projected to return, then a review step that states
 * the terms and the risks, then one confirmation.
 *
 * The review step is not decoration. An investor who has typed a number and
 * pressed a button has decided how much; the review is where they are told
 * what they are buying, what it costs them in fees, and what they are
 * acknowledging — and it is the last place they can walk away, which is why it
 * shows the terms rather than a summary of them.
 *
 * Nothing here computes money. The amount goes to the server as the string
 * that was typed, and every figure shown comes back from the deterministic
 * engine.
 */

interface Fees {
  acquisitionPct: number | null
  managementPct: number | null
  dispositionPct: number | null
}

/** What the investor is asked to acknowledge, by title, before confirming. */
interface Disclosure {
  id: string
  title: string
}

export function InvestmentTicket({
  offeringId, offeringName, minimum, maximum, availableCents, eligibility, status,
  isInvestor, hasAccount, committedCents, disclosures, fees, holdYears, structure, hasInterest,
}: {
  offeringId: string
  offeringName: string
  minimum: number | null
  maximum: number | null
  availableCents: number
  eligibility: EligibilityResult | null
  status: string
  isInvestor: boolean
  hasAccount: boolean
  committedCents: number | null
  disclosures: Disclosure[]
  fees: Fees
  holdYears: number | null
  structure: string
  /** Whether they have already told the sponsor they are watching this. */
  hasInterest: boolean
}) {
  const [amount, setAmount] = useState(minimum ? String(minimum) : '')
  const [step, setStep] = useState<'amount' | 'review'>('amount')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [placing, startPlacing] = useTransition()
  const [confirmState, confirmSubmit, confirming] = useActionState<ActionState, FormData>(confirmOrderAction, {})

  const parsed = parseAmount(amount)
  const available = availableCents as Cents

  if (!isInvestor) {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>Want to invest?</CardTitle></CardHeader>
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            You are reading this with an account set up for a different kind of organisation.
            Investing needs its own account, which anyone can create — everything on this page is
            readable either way.
          </p>
        </CardBody>
      </Card>
    )
  }

  if (!hasAccount) {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>Want to invest?</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            Investing needs an investment account: somewhere to hold your cash so you can deploy it
            across several investments without arranging a transfer each time.
          </p>
          <Link href="/investor/onboarding">
            <Button variant="primary" className="w-full">Open an account</Button>
          </Link>
        </CardBody>
      </Card>
    )
  }

  if (confirmState.success) {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>You are in</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <p className="tnum text-[22px] font-semibold text-ink">
            {parsed === null ? '' : format(parsed)}
          </p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">{confirmState.success}</p>
          <div className="flex flex-col gap-2">
            <Link href="/investor/portfolio"><Button variant="primary" className="w-full">See my portfolio</Button></Link>
            <Link href="/investments"><Button className="w-full">Browse more</Button></Link>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (committedCents !== null) {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>You are in</CardTitle></CardHeader>
        <CardBody className="space-y-2">
          <p className="tnum text-[22px] font-semibold text-ink">{format(committedCents as Cents)}</p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Held in your portfolio. Distributions from this investment land in your cash account.
          </p>
          <Link href="/investor/portfolio"><Button className="w-full">See my portfolio</Button></Link>
        </CardBody>
      </Card>
    )
  }

  if (status !== 'live') {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>This raise is closed</CardTitle></CardHeader>
        <CardBody>
          <p className="text-[13px] text-ink-secondary">
            It is no longer taking investment. You can still read everything on this page.
          </p>
        </CardBody>
      </Card>
    )
  }

  const unmet = eligibility?.requirements.filter((r) => !r.satisfied && r.key !== 'disclosures') ?? []
  const tooLittle = parsed !== null && minimum !== null && parsed < minimum * 100
  const tooMuch = parsed !== null && maximum !== null && parsed > maximum * 100
  const tooBig = parsed !== null && parsed > available
  const remaining = parsed === null ? available : ((available - parsed) as Cents)

  // --- review ---------------------------------------------------------------
  if (step === 'review' && orderId && parsed !== null) {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>Review your investment</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <dl className="space-y-2 text-[12px]">
            <Row label="Investment" value={offeringName} />
            <Row label="Amount" value={format(parsed)} strong />
            <Row label="From" value="Your CareCapital cash" />
            <Row label="Cash after" value={format(remaining)} />
            <Row label="Structure" value={structure} />
            {holdYears ? <Row label="Money tied up" value={`${holdYears} years, targeted`} /> : null}
          </dl>

          <div className="border-t border-line pt-3">
            <p className="text-[12px] font-medium text-ink">Fees</p>
            <dl className="mt-1.5 space-y-1 text-[12px]">
              <Row label="Acquisition fee" value={pct(fees.acquisitionPct)} />
              <Row label="Asset management, a year" value={pct(fees.managementPct)} />
              <Row label="Disposition fee" value={pct(fees.dispositionPct)} />
            </dl>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
              Charged by the operator against the investment. They reduce what is returned to you
              and are already inside the projected figures on this page.
            </p>
          </div>

          <form action={confirmSubmit} className="space-y-3 border-t border-line pt-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="disclosures" value={disclosures.map((d) => d.id).join(',')} />
            {disclosures.length > 0 ? (
              <div>
                <p className="text-[12px] font-medium text-ink">What you are acknowledging</p>
                <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-muted">
                  {disclosures.map((disclosure) => (
                    <li key={disclosure.id}>· {disclosure.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed text-ink-secondary">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                I understand this investment is speculative and illiquid, that I may not be able to
                sell it, that the projected figures are not promises, and that I may lose the whole
                of what I put in.
              </span>
            </label>
            {confirmState.error ? <Alert tone="critical">{confirmState.error}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={!acknowledged || confirming}>
              {confirming ? 'Placing…' : `Confirm ${format(parsed)}`}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('amount'); setOrderId(null) }}
              className="w-full text-[12px] text-ink-muted hover:text-ink"
            >
              Back
            </button>
          </form>
        </CardBody>
      </Card>
    )
  }

  // --- amount ---------------------------------------------------------------
  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader><CardTitle>Invest</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="ticket-amount" className="text-[12px] font-medium text-ink">Amount</label>
            <span className="text-[11px] text-ink-muted">{format(available)} available</span>
          </div>
          <Input
            id="ticket-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={minimum ? String(minimum) : '25,000'}
            className="mt-1.5 text-[17px]"
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            {minimum ? `${formatWhole((minimum * 100) as Cents)} minimum` : 'No stated minimum'}
            {maximum ? ` · ${formatWhole((maximum * 100) as Cents)} maximum` : ''}
            {parsed !== null && !tooBig ? ` · ${format(remaining)} left after` : ''}
          </p>
        </div>

        {tooLittle ? (
          <Alert tone="warning">Below this offering&rsquo;s minimum.</Alert>
        ) : tooMuch ? (
          <Alert tone="warning">Above this offering&rsquo;s maximum.</Alert>
        ) : tooBig ? (
          <Alert tone="warning">
            More than your available cash. <Link href="/investor/cash" className="underline">Add funds</Link> or
            lower the amount.
          </Alert>
        ) : null}

        <Projection offeringId={offeringId} amount={amount} />

        {unmet.length > 0 ? (
          <div className="border-t border-line pt-3">
            <p className="text-[12px] font-medium text-ink">Before you can invest</p>
            <ul className="mt-2 space-y-2">
              {unmet.map((requirement) => (
                <li key={requirement.key} className="text-[12px] leading-relaxed">
                  <span className="flex items-start gap-1.5 font-medium text-ink">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                    {requirement.label}
                  </span>
                  <span className="mt-0.5 block pl-4 text-ink-muted">{requirement.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] text-ink-secondary">
            <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
            You meet everything this offering requires.
          </p>
        )}

        {placeError ? <Alert tone="critical">{placeError}</Alert> : null}

        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={placing || parsed === null || tooLittle || tooMuch || tooBig || unmet.length > 0}
          onClick={() => startPlacing(async () => {
            setPlaceError(null)
            // The key is derived from the offering and the amount, so a
            // double-click sends the same key and places one order.
            const result = await placeOrderAction(offeringId, amount, `ticket:${offeringId}:${parsed}`)
            if (result.error) { setPlaceError(result.error); return }
            if (result.status === 'rejected') {
              setPlaceError(result.detail ?? 'This order could not proceed.')
              return
            }
            setOrderId(result.orderId!)
            setStep('review')
          })}
        >
          {placing ? 'Checking…' : 'Review investment'}
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Nothing is committed until you confirm on the next screen.
        </p>

        <Interest offeringId={offeringId} amount={amount} registered={hasInterest} />
      </CardBody>
    </Card>
  )
}

/**
 * Not ready to invest, but wants the sponsor to know.
 *
 * Kept small and underneath the ticket on purpose. It is the honest option for
 * an investor who has read the page and wants to keep reading, and without it
 * the only two choices on the page are commit money or leave.
 */
function Interest({
  offeringId, amount, registered,
}: {
  offeringId: string
  amount: string
  registered: boolean
}) {
  const [expressed, expressSubmit, expressing] = useActionState<ActionState, FormData>(expressInterestAction, {})
  const [withdrawn, withdrawSubmit, withdrawing] = useActionState<ActionState, FormData>(withdrawInterestAction, {})

  const on = (registered || Boolean(expressed.success)) && !withdrawn.success

  if (on) {
    return (
      <form action={withdrawSubmit} className="border-t border-line pt-3">
        <input type="hidden" name="offeringId" value={offeringId} />
        <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-secondary">
          <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
          The sponsor knows you are watching this. Nothing is committed.
        </p>
        <button
          type="submit"
          disabled={withdrawing}
          className="mt-1 pl-5 text-[11px] text-ink-muted underline hover:text-ink"
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw my interest'}
        </button>
      </form>
    )
  }

  return (
    <form action={expressSubmit} className="border-t border-line pt-3">
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="indicatedAmount" value={amount} />
      {expressed.error ? <Alert tone="critical" className="mb-2">{expressed.error}</Alert> : null}
      <Button type="submit" className="w-full" disabled={expressing}>
        {expressing ? 'Sending…' : 'Not yet — tell the sponsor I am watching'}
      </Button>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
        No money moves and nothing is committed. It puts you on the sponsor&rsquo;s list.
      </p>
    </form>
  )
}

function pct(value: number | null): string {
  return value === null ? 'None' : formatPercent(value * 100, 2)
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`tnum text-right ${strong ? 'text-[14px] font-semibold text-ink' : 'font-medium text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/** What the amount in the field would be projected to return. Computes only. */
function Projection({ offeringId, amount }: { offeringId: string; amount: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof calculateAction>> | null>(null)
  const [shownFor, setShownFor] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const parsed = parseAmount(amount)
  const stale = result !== null && shownFor !== parsed

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full"
        disabled={pending || parsed === null}
        onClick={() => start(async () => {
          if (parsed === null) return
          setResult(await calculateAction(offeringId, parsed / 100))
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
              For {format((shownFor ?? 0) as Cents)}, not the amount now in the box.
            </p>
          ) : null}
          <Row label="You would own" value={formatPercent((result.ownershipPct ?? 0) * 100)} />
          <Row label="Paid out over the hold" value={money(result.projectedDistributions)} />
          <Row label="Paid out at sale" value={money(result.projectedExitProceeds)} />
          <div className="border-t border-line pt-1.5">
            <Row label="Total back" value={money(result.projectedTotal)} strong />
            <Row label="On every dollar in" value={formatRatio(result.projectedMultiple)} />
            <Row label="A year, compounded" value={formatPercent(result.projectedIrrPct)} />
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
            Projected from the operator&rsquo;s stated assumptions, after fees. Not a forecast, not a
            promise, and not advice.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function money(dollars: number | null): string {
  return dollars === null ? '—' : format(Math.round(dollars * 100) as Cents)
}
