'use client'

import { useActionState, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select,
} from '@/components/ui/primitives'
import { cn } from '@/lib/utils/cn'
import { createOfferingAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'

const STEPS = [
  'Structure', 'Issuer', 'Capital', 'Terms', 'Projections', 'Eligibility', 'Review',
] as const

/**
 * The offering wizard.
 *
 * One form, revealed a step at a time, so nothing typed is lost by moving
 * between steps. The assumptions step is not optional decoration: without it
 * the projection engine will refuse to produce returns at all, and the review
 * step says so plainly rather than letting a sponsor discover it later.
 */
export function OfferingWizard({
  dealId, suggestedRaise, dealName,
}: {
  dealId: string
  suggestedRaise: number | null
  dealName: string
}) {
  const [step, setStep] = useState(0)
  const [state, submit, pending] = useActionState<ActionState, FormData>(createOfferingAction, {})

  return (
    <Card>
      <CardHeader><CardTitle>{STEPS[step]}</CardTitle></CardHeader>
      <CardBody>
        <div className="mb-4 flex gap-1 overflow-x-auto">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-[12px]',
                index === step ? 'border-accent font-medium text-accent'
                  : index < step ? 'border-line text-ink-secondary' : 'border-transparent text-ink-muted',
              )}
            >
              <span className="tabular-nums">{index + 1}</span> {label}
            </div>
          ))}
        </div>

        <form action={submit} className="space-y-4">
          <input type="hidden" name="dealId" value={dealId} />

          <Panel visible={step === 0}>
            <Field label="Offering name" htmlFor="name">
              <Input id="name" name="name" required defaultValue={`${dealName} Equity Offering`} />
            </Field>
            <Field label="Offering type" htmlFor="offeringType" hint="Which exemption you and your counsel intend to rely on. The platform does not decide this.">
              <Select id="offeringType" name="offeringType" defaultValue="reg_d_506b">
                <option value="reg_d_506b">Regulation D 506(b)</option>
                <option value="reg_d_506c">Regulation D 506(c)</option>
                <option value="private_equity">Private equity</option>
                <option value="preferred_equity">Preferred equity</option>
                <option value="jv_equity">Joint venture equity</option>
                <option value="fund_interest">Fund interest</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Capital position" htmlFor="capitalPosition">
              <Select id="capitalPosition" name="capitalPosition" defaultValue="common_equity">
                <option value="common_equity">Common equity</option>
                <option value="preferred_equity">Preferred equity</option>
                <option value="mezzanine">Mezzanine</option>
              </Select>
            </Field>
          </Panel>

          <Panel visible={step === 1}>
            <Field label="Issuing entity" htmlFor="issuerEntity" hint="The entity whose securities are being sold.">
              <Input id="issuerEntity" name="issuerEntity" placeholder="Meridian Chicago SNF Holdings LLC" />
            </Field>
            <Field label="Legal structure" htmlFor="legalStructure">
              <Input id="legalStructure" name="legalStructure" placeholder="Delaware LLC, manager-managed" />
            </Field>
            <Field label="Summary for investors" htmlFor="summary">
              <textarea
                id="summary"
                name="summary"
                rows={3}
                className="w-full border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
                placeholder="Two or three sentences on what this offering is and why."
              />
            </Field>
          </Panel>

          <Panel visible={step === 2}>
            <Field
              label="Target raise"
              htmlFor="targetRaise"
              hint={suggestedRaise ? `This deal's equity gap is ${money(suggestedRaise)}.` : undefined}
            >
              <Input id="targetRaise" name="targetRaise" inputMode="numeric" defaultValue={suggestedRaise ?? ''} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum investment" htmlFor="minimumInvestment">
                <Input id="minimumInvestment" name="minimumInvestment" inputMode="numeric" placeholder="50000" />
              </Field>
              <Field label="Maximum investment" htmlFor="maximumInvestment" hint="Optional.">
                <Input id="maximumInvestment" name="maximumInvestment" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Target close date" htmlFor="targetCloseDate">
              <Input id="targetCloseDate" name="targetCloseDate" type="date" />
            </Field>
          </Panel>

          <Panel visible={step === 3}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target hold" htmlFor="holdYears" hint="Years. Required for any projection.">
                <Input id="holdYears" name="holdYears" inputMode="numeric" placeholder="5" />
              </Field>
              <Field label="Preferred return" htmlFor="preferredReturn" hint="Annual percentage.">
                <Input id="preferredReturn" name="preferredReturn" inputMode="numeric" placeholder="8" />
              </Field>
              <Field label="Target IRR" htmlFor="targetIrr" hint="Percentage. A target, never a promise.">
                <Input id="targetIrr" name="targetIrr" inputMode="numeric" placeholder="15" />
              </Field>
              <Field label="Target equity multiple" htmlFor="targetMultiple">
                <Input id="targetMultiple" name="targetMultiple" inputMode="numeric" placeholder="1.8" />
              </Field>
              <Field label="Sponsor promote" htmlFor="promote" hint="Percentage of profit above the hurdle.">
                <Input id="promote" name="promote" inputMode="numeric" placeholder="20" />
              </Field>
            </div>
          </Panel>

          <Panel visible={step === 4}>
            <Alert tone="neutral">
              These assumptions drive every projected figure investors will see. Each one is shown
              to them alongside the result, so a projection can always be traced to what produced
              it. Leave an assumption blank and the projection will say it cannot be computed
              rather than choose one for you.
            </Alert>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Exit capitalisation rate" htmlFor="exitCapRate" hint="Percentage. Use this or the EBITDA multiple.">
                <Input id="exitCapRate" name="exitCapRate" inputMode="numeric" placeholder="9" />
              </Field>
              <Field label="Exit EBITDA multiple" htmlFor="exitMultiple">
                <Input id="exitMultiple" name="exitMultiple" inputMode="numeric" placeholder="6.5" />
              </Field>
              <Field label="Revenue growth" htmlFor="revenueGrowth" hint="Percent a year.">
                <Input id="revenueGrowth" name="revenueGrowth" inputMode="numeric" placeholder="3" />
              </Field>
              <Field label="Expense growth" htmlFor="expenseGrowth" hint="Percent a year.">
                <Input id="expenseGrowth" name="expenseGrowth" inputMode="numeric" placeholder="3" />
              </Field>
              <Field label="Stabilised occupancy" htmlFor="stabilizedOccupancy" hint="Percentage.">
                <Input id="stabilizedOccupancy" name="stabilizedOccupancy" inputMode="numeric" placeholder="89" />
              </Field>
              <Field label="Selling costs" htmlFor="sellingCosts" hint="Percentage of sale price.">
                <Input id="sellingCosts" name="sellingCosts" inputMode="numeric" placeholder="2" />
              </Field>
            </div>
          </Panel>

          <Panel visible={step === 5}>
            <label className="flex items-start gap-2 text-[13px] text-ink">
              <input type="checkbox" name="accreditedRequired" defaultChecked className="mt-0.5" />
              Limit this offering to accredited investors
            </label>
            <label className="flex items-start gap-2 text-[13px] text-ink">
              <input type="checkbox" name="verificationRequired" defaultChecked className="mt-0.5" />
              Require verified identity and screening before a commitment is accepted
            </label>
            <Alert tone="warning">
              Whether this offering may lawfully be made, to whom, and on what terms is a question
              for your securities counsel. CareCapital Exchange does not provide legal advice and
              does not determine that any offering is compliant.
            </Alert>
          </Panel>

          <Panel visible={step === 6}>
            <p className="text-[13px] leading-relaxed text-ink-secondary">
              Creating this offering saves it as a draft. Nothing is visible to investors yet. The
              next steps are to publish documents to the data room, run the completeness check, and
              submit it for review — an administrator publishes it, not you.
            </p>
            {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
          </Panel>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <Button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="gap-1.5">
              <ArrowLeft className="size-3.5" /> Back
            </Button>
            <span className="text-[12px] text-ink-muted">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <Button type="button" variant="primary" className="gap-1.5" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                Continue <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create offering'}
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function Panel({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return <div className={cn('space-y-4', visible ? '' : 'hidden')} aria-hidden={!visible}>{children}</div>
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
