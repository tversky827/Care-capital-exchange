'use client'

import { useActionState, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from '@/components/ui/primitives'
import { createDealAction, type ActionState } from '../actions'
import { US_STATES } from '@/lib/deal/display'
import { cn } from '@/lib/utils/cn'
import { ASSET_TYPES, TRANSACTION_TYPES } from '@/types'
import { titleize } from '@/lib/utils/format'

/**
 * Deal creation wizard.
 *
 * All six steps live inside one form and are shown or hidden rather than
 * mounted and unmounted, so nothing typed on an earlier step is lost when
 * moving forward and back, and a single submit carries the whole deal. Only
 * step one is genuinely required; everything else can be completed later
 * against the readiness checklist.
 */

const STEPS = [
  { key: 'transaction', label: 'Transaction', hint: 'What kind of financing, on what kind of asset.' },
  { key: 'facility', label: 'Facility', hint: 'Where it is, how big it is, and who operates it.' },
  { key: 'operating', label: 'Operations', hint: 'Trailing performance, census and payer mix.' },
  { key: 'terms', label: 'Capital', hint: 'Price, request, existing debt and the capital plan.' },
  { key: 'sponsor', label: 'Sponsor', hint: 'Operating history and financial capacity.' },
  { key: 'review', label: 'Review', hint: 'Confirm and create.' },
] as const

export function DealWizard({ defaultLegalEntity }: { defaultLegalEntity: string }) {
  const [step, setStep] = useState(0)
  const [state, submit, pending] = useActionState<ActionState, FormData>(createDealAction, {})
  const [transactionType, setTransactionType] = useState('acquisition')
  const [facilityName, setFacilityName] = useState('')
  const [stateCode, setStateCode] = useState('')

  const involvesPurchase = transactionType === 'acquisition' || transactionType === 'acquisition_refinance'
  const canAdvance = step > 0 || Boolean(transactionType)
  const step2Complete = facilityName.trim().length > 0 && stateCode.length === 2

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="eyebrow">New financing opportunity</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Create a deal</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
          Only the facility name and state are required to start. Everything else can be added later —
          the readiness checklist will tell you exactly what lenders still need.
        </p>
      </div>

      {/* Step rail ------------------------------------------------------- */}
      <Card>
        <div className="flex overflow-x-auto">
          {STEPS.map((item, index) => {
            const done = index < step
            const active = index === step
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStep(index)}
                disabled={index > step && !step2Complete && index > 1}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 border-r border-line px-3 py-2.5 text-left last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'bg-accent-soft' : 'hover:bg-surface-sunken',
                )}
              >
                <span
                  className={cn(
                    'tnum flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold rounded-full',
                    done ? 'bg-positive text-white' : active ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-muted',
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block truncate text-[12px] font-medium', active ? 'text-accent' : 'text-ink')}>
                    {item.label}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="h-0.5 bg-surface-sunken">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      <form action={submit}>
        {/* Step 1 — transaction ---------------------------------------- */}
        <StepPanel visible={step === 0} title="Transaction" hint={STEPS[0].hint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transaction type" htmlFor="transactionType">
              <Select
                id="transactionType"
                name="transactionType"
                value={transactionType}
                onChange={(event) => setTransactionType(event.target.value)}
              >
                {TRANSACTION_TYPES.map((type) => (
                  <option key={type} value={type}>{titleize(type)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Asset type" htmlFor="assetType" hint="Skilled nursing is the deepest supported vertical today.">
              <Select id="assetType" name="assetType" defaultValue="snf">
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>{titleize(type)}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            className="mt-4"
            label="What matters most to you in this financing?"
            htmlFor="borrowerPriority"
            hint="Offer comparison is ranked against this priority. You can change it at any time."
          >
            <Select id="borrowerPriority" name="borrowerPriority" defaultValue="lowest_rate">
              <option value="lowest_rate">Lowest financing cost</option>
              <option value="highest_leverage">Highest proceeds</option>
              <option value="longest_term">Longest term</option>
              <option value="maximum_io">Maximum interest-only</option>
              <option value="lowest_fees">Lowest fees</option>
              <option value="non_recourse">Non-recourse</option>
              <option value="fastest_closing">Fastest closing</option>
              <option value="most_certainty">Greatest certainty of close</option>
            </Select>
          </Field>

          <Field
            className="mt-4"
            label="Transaction narrative"
            htmlFor="narrative"
            hint="Two or three sentences on the story. This appears at the top of the credit memo."
          >
            <Textarea id="narrative" name="narrative" rows={3} placeholder="e.g. Acquisition of a stabilised 120-bed facility from a retiring owner-operator…" />
          </Field>
        </StepPanel>

        {/* Step 2 — facility ------------------------------------------- */}
        <StepPanel visible={step === 1} title="Facility" hint={STEPS[1].hint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Facility name" htmlFor="facilityName" className="sm:col-span-2">
              <Input
                id="facilityName"
                name="facilityName"
                required
                value={facilityName}
                onChange={(event) => setFacilityName(event.target.value)}
                placeholder="Lakeview Skilled Nursing Center"
              />
            </Field>
            <Field label="Street address" htmlFor="addressLine1" className="sm:col-span-2">
              <Input id="addressLine1" name="addressLine1" autoComplete="off" />
            </Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State" htmlFor="state">
                <Select id="state" name="state" required value={stateCode} onChange={(event) => setStateCode(event.target.value)}>
                  <option value="">Select</option>
                  {US_STATES.map((option) => (
                    <option key={option.code} value={option.code}>{option.code}</option>
                  ))}
                </Select>
              </Field>
              <Field label="ZIP" htmlFor="zip"><Input id="zip" name="zip" inputMode="numeric" /></Field>
            </div>
            <Field label="County" htmlFor="county"><Input id="county" name="county" /></Field>
            <Field label="Property type" htmlFor="propertyType">
              <Input id="propertyType" name="propertyType" placeholder="Freestanding skilled nursing facility" />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label="Licensed beds" htmlFor="licensedBeds"><Input id="licensedBeds" name="licensedBeds" inputMode="numeric" /></Field>
            <Field label="Certified beds" htmlFor="certifiedBeds"><Input id="certifiedBeds" name="certifiedBeds" inputMode="numeric" /></Field>
            <Field label="Operating beds" htmlFor="operatingBeds"><Input id="operatingBeds" name="operatingBeds" inputMode="numeric" /></Field>
            <Field label="Current census" htmlFor="currentCensus"><Input id="currentCensus" name="currentCensus" inputMode="numeric" /></Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Year built" htmlFor="yearBuilt"><Input id="yearBuilt" name="yearBuilt" inputMode="numeric" /></Field>
            <Field label="Last renovation" htmlFor="lastRenovationYear"><Input id="lastRenovationYear" name="lastRenovationYear" inputMode="numeric" /></Field>
            <Field label="Real estate included?" htmlFor="realEstateIncluded">
              <Select id="realEstateIncluded" name="realEstateIncluded" defaultValue="yes">
                <option value="yes">Yes — property and operations</option>
                <option value="no">No — operations only</option>
              </Select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Ownership structure" htmlFor="ownershipStructure">
              <Input id="ownershipStructure" name="ownershipStructure" placeholder="Single-asset LLC" />
            </Field>
            <Field label="Operating company" htmlFor="operatingCompany"><Input id="operatingCompany" name="operatingCompany" /></Field>
            <Field label="Management company" htmlFor="managementCompany" hint="Leave blank if self-managed.">
              <Input id="managementCompany" name="managementCompany" />
            </Field>
          </div>
        </StepPanel>

        {/* Step 3 — operating ------------------------------------------ */}
        <StepPanel visible={step === 2} title="Operations" hint={STEPS[2].hint}>
          <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
            Enter the most recent full year you have. You can upload statements next and the figures
            will be extracted from them — anything you enter here is treated as approved.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fiscal year" htmlFor="fiscalYear">
              <Input id="fiscalYear" name="fiscalYear" inputMode="numeric" defaultValue={new Date().getUTCFullYear() - 1} />
            </Field>
            <Field label="Revenue" htmlFor="fin_revenue"><Input id="fin_revenue" name="fin_revenue" placeholder="$18,400,000" /></Field>
            <Field label="EBITDA" htmlFor="fin_ebitda"><Input id="fin_ebitda" name="fin_ebitda" placeholder="$2,710,000" /></Field>
            <Field label="Labor expense" htmlFor="fin_labor_expense"><Input id="fin_labor_expense" name="fin_labor_expense" /></Field>
            <Field label="Agency labor" htmlFor="fin_agency_labor"><Input id="fin_agency_labor" name="fin_agency_labor" /></Field>
            <Field label="Rent" htmlFor="fin_rent" hint="Zero if the property is owned."><Input id="fin_rent" name="fin_rent" /></Field>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Occupancy %" htmlFor="occupancyPct"><Input id="occupancyPct" name="occupancyPct" placeholder="87" /></Field>
            <Field label="Net income" htmlFor="fin_net_income"><Input id="fin_net_income" name="fin_net_income" /></Field>
          </div>

          <fieldset className="mt-5">
            <legend className="text-[12px] font-medium text-ink-secondary">Payer mix (%)</legend>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Medicaid concentration determines which lenders can participate at all, so this is worth
              getting right.
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-5">
              <Field label="Medicare" htmlFor="medicarePct"><Input id="medicarePct" name="medicarePct" inputMode="decimal" /></Field>
              <Field label="Medicaid" htmlFor="medicaidPct"><Input id="medicaidPct" name="medicaidPct" inputMode="decimal" /></Field>
              <Field label="Managed care" htmlFor="managedCarePct"><Input id="managedCarePct" name="managedCarePct" inputMode="decimal" /></Field>
              <Field label="Private pay" htmlFor="privatePayPct"><Input id="privatePayPct" name="privatePayPct" inputMode="decimal" /></Field>
              <Field label="Other" htmlFor="otherPayerPct"><Input id="otherPayerPct" name="otherPayerPct" inputMode="decimal" /></Field>
            </div>
          </fieldset>
        </StepPanel>

        {/* Step 4 — capital -------------------------------------------- */}
        <StepPanel visible={step === 3} title="Capital" hint={STEPS[3].hint}>
          <div className="grid gap-4 sm:grid-cols-3">
            {involvesPurchase ? (
              <Field label="Purchase price" htmlFor="purchasePrice"><Input id="purchasePrice" name="purchasePrice" placeholder="$14,000,000" /></Field>
            ) : null}
            <Field label="Requested financing" htmlFor="requestedFinancing">
              <Input id="requestedFinancing" name="requestedFinancing" placeholder="$10,500,000" />
            </Field>
            <Field label="Appraised value" htmlFor="appraisedValue" hint="If an appraisal exists.">
              <Input id="appraisedValue" name="appraisedValue" />
            </Field>
            <Field label="Existing debt to retire" htmlFor="existingDebt"><Input id="existingDebt" name="existingDebt" /></Field>
            <Field label="Seller financing" htmlFor="sellerFinancing"><Input id="sellerFinancing" name="sellerFinancing" /></Field>
            <Field label="Sponsor cash equity" htmlFor="cashEquity" hint="Leave blank to have it derived from the capital stack.">
              <Input id="cashEquity" name="cashEquity" />
            </Field>
            <Field label="Estimated closing costs" htmlFor="closingCosts"><Input id="closingCosts" name="closingCosts" /></Field>
            <Field label="Capital expenditure requirement" htmlFor="capexRequirement"><Input id="capexRequirement" name="capexRequirement" /></Field>
            <Field label="Working capital requirement" htmlFor="workingCapital"><Input id="workingCapital" name="workingCapital" /></Field>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Target closing date" htmlFor="targetCloseDate"><Input id="targetCloseDate" name="targetCloseDate" type="date" /></Field>
            {involvesPurchase ? (
              <>
                <Field label="Purchase agreement status" htmlFor="purchaseAgreementStatus">
                  <Input id="purchaseAgreementStatus" name="purchaseAgreementStatus" placeholder="Executed, diligence open" />
                </Field>
                <Field label="LOI status" htmlFor="loiStatus"><Input id="loiStatus" name="loiStatus" /></Field>
              </>
            ) : null}
          </div>

          <fieldset className="mt-5">
            <legend className="text-[12px] font-medium text-ink-secondary">Requested terms (optional)</legend>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Leave blank and coverage will be computed against a stated platform assumption, which is
              labelled as an assumption everywhere it appears.
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-4">
              <Field label="Rate %" htmlFor="requestedRatePct"><Input id="requestedRatePct" name="requestedRatePct" placeholder="7.25" /></Field>
              <Field label="Term (months)" htmlFor="requestedTermMonths"><Input id="requestedTermMonths" name="requestedTermMonths" placeholder="60" /></Field>
              <Field label="Amortization (months)" htmlFor="requestedAmortMonths"><Input id="requestedAmortMonths" name="requestedAmortMonths" placeholder="300" /></Field>
              <Field label="Interest-only (months)" htmlFor="requestedIoMonths"><Input id="requestedIoMonths" name="requestedIoMonths" placeholder="12" /></Field>
            </div>
          </fieldset>
        </StepPanel>

        {/* Step 5 — sponsor -------------------------------------------- */}
        <StepPanel visible={step === 4} title="Sponsor" hint={STEPS[4].hint}>
          <Field label="Borrowing entity" htmlFor="legalEntity">
            <Input id="legalEntity" name="legalEntity" defaultValue={defaultLegalEntity} />
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label="Years in healthcare" htmlFor="yearsInHealthcare"><Input id="yearsInHealthcare" name="yearsInHealthcare" inputMode="numeric" /></Field>
            <Field label="Years in this asset type" htmlFor="yearsOperatingAssetType"><Input id="yearsOperatingAssetType" name="yearsOperatingAssetType" inputMode="numeric" /></Field>
            <Field label="Facilities operated" htmlFor="facilitiesOperated"><Input id="facilitiesOperated" name="facilitiesOperated" inputMode="numeric" /></Field>
            <Field label="Beds under management" htmlFor="bedsOperated"><Input id="bedsOperated" name="bedsOperated" inputMode="numeric" /></Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="States operated" htmlFor="statesOperated" hint="Comma separated, e.g. IL, IN, WI">
              <Input id="statesOperated" name="statesOperated" />
            </Field>
            <Field label="Historical acquisitions" htmlFor="historicalAcquisitions"><Input id="historicalAcquisitions" name="historicalAcquisitions" inputMode="numeric" /></Field>
            <Field label="Previous exits" htmlFor="previousExits"><Input id="previousExits" name="previousExits" inputMode="numeric" /></Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              label="Any prior defaults?"
              htmlFor="priorDefaults"
              hint="Disclosing up front is materially better than a lender finding it in diligence."
            >
              <Select id="priorDefaults" name="priorDefaults" defaultValue="no">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
            <Field label="Net worth" htmlFor="netWorth" hint="Optional."><Input id="netWorth" name="netWorth" /></Field>
            <Field label="Liquidity" htmlFor="liquidity" hint="Optional."><Input id="liquidity" name="liquidity" /></Field>
          </div>

          <Field className="mt-4" label="Management team" htmlFor="managementTeam">
            <Textarea id="managementTeam" name="managementTeam" rows={3} />
          </Field>
          <Field className="mt-4" label="Relevant operating experience" htmlFor="relevantExperience">
            <Textarea id="relevantExperience" name="relevantExperience" rows={3} />
          </Field>
        </StepPanel>

        {/* Step 6 — review --------------------------------------------- */}
        <StepPanel visible={step === 5} title="Review and create" hint={STEPS[5].hint}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <ReviewRow label="Facility" value={facilityName || 'Not provided'} />
            <ReviewRow label="State" value={stateCode || 'Not provided'} />
            <ReviewRow label="Transaction" value={titleize(transactionType)} />
          </dl>

          <Field
            className="mt-5"
            label="Marketplace confidentiality"
            htmlFor="anonymize"
            hint="When on, lenders browsing the marketplace see only the asset type, size and state — never the facility name — until you distribute the deal to them directly."
          >
            <Select id="anonymize" name="anonymize" defaultValue="on">
              <option value="on">Anonymise on the marketplace (recommended)</option>
              <option value="off">Show the facility name</option>
            </Select>
          </Field>

          <Alert tone="neutral" className="mt-5">
            Creating the deal does not share it with anyone. It stays private to your organisation
            until you explicitly distribute it, and you will see the full recipient list before
            anything is sent.
          </Alert>

          {state.error ? <Alert tone="critical" className="mt-4">{state.error}</Alert> : null}
        </StepPanel>

        {/* Navigation --------------------------------------------------- */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="gap-1.5">
            <ArrowLeft className="size-3.5" /> Back
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-muted">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                variant="primary"
                className="gap-1.5"
                onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
                disabled={!canAdvance || (step === 1 && !step2Complete)}
              >
                Continue <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={pending || !step2Complete}>
                {pending ? 'Creating…' : 'Create deal'}
              </Button>
            )}
          </div>
        </div>

        {step === 1 && !step2Complete ? (
          <p className="mt-2 text-right text-[11px] text-ink-muted">
            A facility name and state are needed to continue.
          </p>
        ) : null}
      </form>
    </div>
  )
}

function StepPanel({
  visible, title, hint, children,
}: {
  visible: boolean
  title: string
  hint: string
  children: React.ReactNode
}) {
  // Hidden rather than unmounted so field values survive navigation and a
  // single submit carries every step.
  return (
    <Card className={visible ? '' : 'hidden'} aria-hidden={!visible}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">{hint}</p>
        </div>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line pb-2">
      <dt className="text-[11px] uppercase tracking-[0.04em] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
    </div>
  )
}
