'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FlaskConical } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui/primitives'
import { format, formatWhole, parseAmount, type Cents } from '@/lib/money'
import { formatPercent, formatRatio } from '@/lib/utils/format'
import { practiceInvestAction } from '@/app/(app)/sandbox/actions'
import { calculateAction } from './actions'

/**
 * The practice ticket.
 *
 * The same two steps as the live ticket — an amount, then a review, then one
 * confirmation — because a person who practises should be practising the
 * sequence they will actually use. What differs is what the review says, and
 * it says it in full: what is virtual, what is real, and what this does not
 * create.
 *
 * There is no eligibility panel and no disclosure acknowledgement, and their
 * absence is honest rather than a shortcut. Nothing here creates a security,
 * so there is nothing to be eligible for and nothing to acknowledge. Asking a
 * person to tick a box that acknowledges risk they are not taking would teach
 * them the box is a formality, which is the opposite of what it is for.
 */
export function PracticeTicket({
  offeringId, offeringName, minimum, maximum, availableCents, status, heldCents, holdYears, structure,
}: {
  offeringId: string
  offeringName: string
  minimum: number | null
  maximum: number | null
  availableCents: number
  status: string
  /** What this account already holds here, in cents. */
  heldCents: number | null
  holdYears: number | null
  structure: string
}) {
  const [amount, setAmount] = useState(minimum ? String(minimum) : '')
  const [step, setStep] = useState<'amount' | 'review' | 'done'>('amount')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const parsed = parseAmount(amount)
  const available = availableCents as Cents

  if (step === 'done') {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>Practice investment recorded</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <p className="tnum text-[22px] font-semibold text-ink">
            {parsed === null ? '' : format(parsed)}
          </p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Virtual money only. No securities were bought, no commitment was made, the sponsor has
            not been told, and this raise&rsquo;s capital is unchanged.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/sandbox/portfolio">
              <Button variant="primary" className="w-full">See my practice portfolio</Button>
            </Link>
            <Link href="/investments"><Button className="w-full">Browse more</Button></Link>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (status !== 'live') {
    return (
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>This raise is closed</CardTitle></CardHeader>
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            It is no longer taking investment, so there is nothing to practise against. You can
            still read everything on this page.
          </p>
        </CardBody>
      </Card>
    )
  }

  const tooLittle = parsed !== null && minimum !== null && parsed < minimum * 100
  const tooMuch = parsed !== null && maximum !== null && parsed > maximum * 100
  const tooBig = parsed !== null && parsed > available
  const remaining = parsed === null ? available : ((available - parsed) as Cents)

  if (step === 'review' && parsed !== null) {
    return (
      <Card className="lg:sticky lg:top-4 border-accent-line">
        <CardHeader className="bg-accent-soft">
          <CardTitle className="flex items-center gap-1.5 text-accent">
            <FlaskConical className="size-4" />
            Practice investment
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            You are about to invest virtual money in a real opportunity. Everything below the line
            is what this does <em>not</em> do.
          </p>

          <dl className="space-y-2 text-[12px]">
            <Row label="Investment" value={offeringName} />
            <Row label="Virtual amount" value={format(parsed)} strong />
            <Row label="From" value="Your sandbox cash" />
            <Row label="Virtual cash after" value={format(remaining)} />
            <Row label="Structure" value={structure} />
            {holdYears ? <Row label="Money would be tied up" value={`${holdYears} years, targeted`} /> : null}
          </dl>

          <dl className="space-y-2 border-t border-line pt-3 text-[12px]">
            <Row label="Real money" value="$0.00" />
            <Row label="Real securities" value="None" />
            <Row label="Real commitment" value="None" />
            <Row label="Sponsor notified" value="No" />
            <Row label="Effect on this raise" value="None" />
          </dl>

          {error ? <Alert tone="critical">{error}</Alert> : null}

          <div className="space-y-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              disabled={pending}
              onClick={() => start(async () => {
                setError(null)
                // Keyed by the offering and the amount, so a double-click
                // records one investment rather than two.
                const result = await practiceInvestAction(
                  offeringId, amount, `practice:${offeringId}:${parsed}:${Date.now() - (Date.now() % 60_000)}`,
                )
                if (result.error) { setError(result.error); return }
                setStep('done')
              })}
            >
              {pending ? 'Recording…' : `Confirm ${format(parsed)} of virtual money`}
            </Button>
            <button
              type="button"
              onClick={() => setStep('amount')}
              className="w-full text-[12px] text-ink-muted hover:text-ink"
            >
              Back
            </button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="lg:sticky lg:top-4 border-accent-line">
      <CardHeader className="bg-accent-soft">
        <CardTitle className="flex items-center gap-1.5 text-accent">
          <FlaskConical className="size-4" />
          Practice invest
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {heldCents !== null && heldCents > 0 ? (
          <p className="text-[12px] text-ink-secondary">
            You already hold {format(heldCents as Cents)} here in practice. Investing again adds to
            that stake.
          </p>
        ) : null}

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="practice-amount" className="text-[12px] font-medium text-ink">Amount</label>
            <span className="text-[11px] text-ink-muted">{format(available)} virtual cash</span>
          </div>
          <Input
            id="practice-amount"
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
          <Alert tone="warning">Below this offering&rsquo;s minimum. The sandbox holds you to the real one.</Alert>
        ) : tooMuch ? (
          <Alert tone="warning">Above this offering&rsquo;s maximum.</Alert>
        ) : tooBig ? (
          <Alert tone="warning">
            More than your virtual cash. <Link href="/sandbox/cash" className="underline">Add some</Link> or
            lower the amount.
          </Alert>
        ) : null}

        <Projection offeringId={offeringId} amount={amount} />

        {error ? <Alert tone="critical">{error}</Alert> : null}

        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={parsed === null || tooLittle || tooMuch || tooBig}
          onClick={() => { setError(null); setStep('review') }}
        >
          Review practice investment
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Virtual money. Nothing you do here creates an investment, a commitment or a financial
          obligation, and no sponsor is told.
        </p>
      </CardBody>
    </Card>
  )
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

/** The same projection the live ticket shows, from the same engine. */
function Projection({ offeringId, amount }: { offeringId: string; amount: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof calculateAction>> | null>(null)
  const [pending, start] = useTransition()
  const parsed = parseAmount(amount)

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full"
        disabled={pending || parsed === null}
        onClick={() => start(async () => {
          if (parsed === null) return
          setResult(await calculateAction(offeringId, parsed / 100))
        })}
      >
        {pending ? 'Working it out…' : result ? 'Recalculate' : 'What could this return?'}
      </Button>

      {result?.insufficientData ? (
        <Alert tone="warning">{result.insufficientData}</Alert>
      ) : result ? (
        <div className="space-y-1.5 rounded border border-line bg-surface-sunken p-3 text-[12px]">
          <Row label="You would own" value={formatPercent((result.ownershipPct ?? 0) * 100)} />
          <Row label="Paid out over the hold" value={money(result.projectedDistributions)} />
          <Row label="Paid out at sale" value={money(result.projectedExitProceeds)} />
          <div className="border-t border-line pt-1.5">
            <Row label="Total back" value={money(result.projectedTotal)} strong />
            <Row label="On every dollar in" value={formatRatio(result.projectedMultiple)} />
            <Row label="A year, compounded" value={formatPercent(result.projectedIrrPct)} />
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
            Hypothetical. Projected from the operator&rsquo;s stated assumptions, after fees. Not a
            forecast, not a promise, not advice, and not a result.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function money(dollars: number | null): string {
  return dollars === null ? '—' : format(Math.round(dollars * 100) as Cents)
}
