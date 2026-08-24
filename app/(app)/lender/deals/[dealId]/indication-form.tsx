'use client'

import { useActionState, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { submitIndicationAction, withdrawIndicationAction } from '../../actions'
import { dscr, financingCost } from '@/lib/finance/calculations'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import type { ActionState } from '@/app/(app)/deals/actions'

/**
 * Indication submission.
 *
 * The live preview is the point: as the lender types, the same deterministic
 * engine the borrower sees computes payment, coverage and fee-loaded effective
 * cost, so terms are priced against the deal's own cash flow before they are
 * submitted rather than after.
 */
export function IndicationForm({
  dealId, requested, noi, existing, typical,
}: {
  dealId: string
  requested: number | null
  noi: number | null
  existing: {
    id: string
    loan_amount: number
    all_in_rate_pct: number
    term_months: number
    amortization_months: number
    interest_only_months: number
    origination_fee_pct: number
    recourse: string
    status: string
    version: number
  } | null
  typical: {
    rateLow: number | null
    rateHigh: number | null
    termMonths: number | null
    maxLtv: number | null
    minDscr: number | null
  } | null
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(submitIndicationAction, {})
  const [withdrawState, withdrawSubmit] = useActionState<ActionState, FormData>(withdrawIndicationAction, {})
  const [open, setOpen] = useState(!existing)

  const [terms, setTerms] = useState({
    loan_amount: existing?.loan_amount ?? requested ?? 0,
    all_in_rate_pct: existing?.all_in_rate_pct ?? typical?.rateLow ?? 7.5,
    term_months: existing?.term_months ?? typical?.termMonths ?? 60,
    amortization_months: existing?.amortization_months ?? 300,
    interest_only_months: existing?.interest_only_months ?? 0,
    origination_fee_pct: existing?.origination_fee_pct ?? 1,
    exit_fee_pct: 0,
  })

  const preview = useMemo(() => {
    const cost = financingCost({
      loanAmount: terms.loan_amount,
      allInRatePct: terms.all_in_rate_pct,
      termMonths: terms.term_months,
      amortizationMonths: terms.amortization_months,
      interestOnlyMonths: terms.interest_only_months,
      originationFeePct: terms.origination_fee_pct,
      exitFeePct: terms.exit_fee_pct,
    })
    return { cost, coverage: dscr(noi, cost.annualDebtService) }
  }, [terms, noi])

  const update = (key: keyof typeof terms) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value.replace(/[$,%\s]/g, ''))
    setTerms((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }))
  }

  if (state.success) {
    return <Alert tone="positive" title="Indication submitted">{state.success}</Alert>
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{existing ? 'Your financing indication' : 'Submit a financing indication'}</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            An indication of interest, not a commitment to lend.
          </p>
        </div>
        {existing ? (
          <Badge tone={existing.status === 'selected' ? 'positive' : 'accent'}>
            {titleize(existing.status)} · v{existing.version}
          </Badge>
        ) : null}
      </CardHeader>

      {existing && !open ? (
        <CardBody>
          <dl className="space-y-1.5 text-[12px]">
            <Row label="Loan amount" value={formatCurrency(existing.loan_amount)} />
            <Row label="All-in rate" value={formatPercent(existing.all_in_rate_pct, 2)} />
            <Row label="Term" value={`${Math.round(existing.term_months / 12)} years`} />
            <Row label="Amortization" value={`${Math.round(existing.amortization_months / 12)} years`} />
            <Row label="Interest-only" value={existing.interest_only_months ? `${existing.interest_only_months} months` : 'None'} />
            <Row label="Recourse" value={titleize(existing.recourse)} />
          </dl>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Revise terms</Button>
            {existing.status !== 'selected' ? (
              <form
                action={withdrawSubmit}
                onSubmit={(event) => {
                  if (!window.confirm('Withdraw this indication? The borrower will be notified.')) event.preventDefault()
                }}
              >
                <input type="hidden" name="dealId" value={dealId} />
                <input type="hidden" name="indicationId" value={existing.id} />
                <Button type="submit" size="sm">Withdraw</Button>
              </form>
            ) : null}
          </div>
          {withdrawState.error ? <Alert tone="critical" className="mt-2">{withdrawState.error}</Alert> : null}
          {withdrawState.success ? <Alert tone="positive" className="mt-2">{withdrawState.success}</Alert> : null}
        </CardBody>
      ) : (
        <CardBody>
          <form action={submit} className="space-y-4">
            <input type="hidden" name="dealId" value={dealId} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Loan amount" htmlFor="loan_amount" hint={requested ? `Requested: ${formatCurrency(requested)}` : undefined}>
                <Input id="loan_amount" name="loan_amount" required defaultValue={terms.loan_amount} onChange={update('loan_amount')} />
              </Field>
              <Field
                label="All-in rate %"
                htmlFor="all_in_rate_pct"
                hint={typical?.rateLow ? `Your typical range: ${typical.rateLow}%–${typical.rateHigh}%` : undefined}
              >
                <Input id="all_in_rate_pct" name="all_in_rate_pct" required defaultValue={terms.all_in_rate_pct} onChange={update('all_in_rate_pct')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rate type" htmlFor="rate_type">
                <Select id="rate_type" name="rate_type" defaultValue="fixed">
                  <option value="fixed">Fixed</option>
                  <option value="floating">Floating</option>
                </Select>
              </Field>
              <Field label="Index" htmlFor="index_name" hint="Floating only.">
                <Input id="index_name" name="index_name" placeholder="SOFR (30-day average)" />
              </Field>
              <Field label="Index rate %" htmlFor="index_rate_pct"><Input id="index_rate_pct" name="index_rate_pct" /></Field>
              <Field label="Spread %" htmlFor="spread_pct"><Input id="spread_pct" name="spread_pct" /></Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Term (months)" htmlFor="term_months">
                <Input id="term_months" name="term_months" required defaultValue={terms.term_months} onChange={update('term_months')} />
              </Field>
              <Field label="Amortization (months)" htmlFor="amortization_months">
                <Input id="amortization_months" name="amortization_months" required defaultValue={terms.amortization_months} onChange={update('amortization_months')} />
              </Field>
              <Field label="Interest-only (months)" htmlFor="interest_only_months">
                <Input id="interest_only_months" name="interest_only_months" defaultValue={terms.interest_only_months} onChange={update('interest_only_months')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Origination fee %" htmlFor="origination_fee_pct">
                <Input id="origination_fee_pct" name="origination_fee_pct" defaultValue={terms.origination_fee_pct} onChange={update('origination_fee_pct')} />
              </Field>
              <Field label="Exit fee %" htmlFor="exit_fee_pct">
                <Input id="exit_fee_pct" name="exit_fee_pct" defaultValue={terms.exit_fee_pct} onChange={update('exit_fee_pct')} />
              </Field>
              <Field label="Closing timeline (days)" htmlFor="closing_timeline_days">
                <Input id="closing_timeline_days" name="closing_timeline_days" placeholder="60" />
              </Field>
            </div>

            {/* Live preview ------------------------------------------------ */}
            <div className="border border-line bg-surface-sunken p-3">
              <p className="eyebrow mb-2">Under these terms</p>
              <dl className="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
                <Row label="Monthly payment" value={formatCurrency(preview.cost.monthlyPaymentAmortizing, { decimals: 0 })} />
                <Row label="Annual debt service" value={formatCurrency(preview.cost.annualDebtService)} />
                <Row
                  label="DSCR on underwritten NOI"
                  value={formatRatio(preview.coverage)}
                  tone={preview.coverage !== null && typical?.minDscr && preview.coverage < typical.minDscr ? 'critical' : 'positive'}
                />
                <Row label="Effective cost (fee-loaded)" value={formatPercent(preview.cost.effectiveRatePct, 2)} />
                <Row label="Balloon at maturity" value={formatCurrency(preview.cost.balloonBalance, { compact: true })} />
                <Row label="Total fees" value={formatCurrency(preview.cost.totalFees)} />
              </dl>
              {preview.coverage !== null && typical?.minDscr && preview.coverage < typical.minDscr ? (
                <p className="mt-2 text-[11px] leading-snug text-critical">
                  These terms cover at {formatRatio(preview.coverage)}, below your own stated{' '}
                  {formatRatio(typical.minDscr)} minimum.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Recourse" htmlFor="recourse">
                <Select id="recourse" name="recourse" defaultValue="full_recourse">
                  <option value="full_recourse">Full recourse</option>
                  <option value="partial_recourse">Partial recourse</option>
                  <option value="non_recourse">Non-recourse</option>
                </Select>
              </Field>
              <Field label="Indication expires" htmlFor="expires_at">
                <Input id="expires_at" name="expires_at" type="date" />
              </Field>
            </div>

            <Field label="Prepayment terms" htmlFor="prepayment_terms">
              <Input id="prepayment_terms" name="prepayment_terms" placeholder="5-4-3-2-1 declining prepayment premium" />
            </Field>
            <Field label="Guarantees" htmlFor="guarantees">
              <Input id="guarantees" name="guarantees" placeholder="Full personal guarantee from the principals" />
            </Field>
            <Field label="Covenants" htmlFor="covenants">
              <Textarea id="covenants" name="covenants" rows={2} placeholder="Minimum 1.25x DSCR tested quarterly" />
            </Field>
            <Field label="Conditions" htmlFor="conditions" hint="One per line.">
              <Textarea id="conditions" name="conditions" rows={3} placeholder={'Satisfactory third-party appraisal\nLicensure transfer approval'} />
            </Field>
            <Field label="Additional terms" htmlFor="additional_terms">
              <Textarea id="additional_terms" name="additional_terms" rows={2} />
            </Field>

            <label className="flex items-start gap-2 border border-line p-3">
              <input type="checkbox" name="is_commitment" value="yes" className="mt-0.5 accent-[#1f4e79]" />
              <span className="text-[12px] leading-relaxed text-ink-secondary">
                This is a firm commitment to lend, not an indication of interest. Only tick this if
                your institution has completed credit approval — it is presented to the borrower as a
                materially different instrument.
              </span>
            </label>

            {state.error ? <Alert tone="critical">{state.error}</Alert> : null}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Submitting…' : existing ? 'Submit revised terms' : 'Submit indication'}
              </Button>
              {existing ? <Button type="button" onClick={() => setOpen(false)}>Cancel</Button> : null}
            </div>
          </form>
        </CardBody>
      )}
    </Card>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'critical' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className={`tnum shrink-0 font-medium ${tone === 'critical' ? 'text-critical' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
