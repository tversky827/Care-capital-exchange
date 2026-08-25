'use client'

import { useActionState } from 'react'
import { Check } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Label, Select,
} from '@/components/ui/primitives'
import { ASSET_TYPES } from '@/types'
import { finishOnboardingAction, onboardingAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type {
  InvestorPreferences, InvestorProfile, InvestorVerification, OnboardingStage,
} from '@/types/equity'

const ASSET_LABELS: Record<string, string> = {
  snf: 'Skilled nursing', alf: 'Assisted living', memory_care: 'Memory care',
  behavioral_health: 'Behavioral health', medical_office: 'Medical office',
  hospital: 'Hospital', home_health: 'Home health', hospice: 'Hospice',
  physician_practice: 'Physician practice', dental_practice: 'Dental practice', other: 'Other',
}

const STEP_TITLES: Record<OnboardingStage, string> = {
  profile: 'Who is investing',
  experience: 'Investment experience',
  preferences: 'What you look for',
  risk: 'Risk and return',
  eligibility: 'Eligibility',
  kyc: 'Identity and screening',
  accreditation: 'Accreditation',
  agreements: 'Agreements',
  account: 'Ready to invest',
  complete: 'Complete',
}

export function OnboardingWizard({
  stage, profile, preferences, verifications,
}: {
  stage: OnboardingStage
  profile: InvestorProfile | null
  preferences: InvestorPreferences | null
  verifications: InvestorVerification[]
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(onboardingAction, {})
  const [finishState, finishSubmit, finishPending] = useActionState<ActionState, FormData>(finishOnboardingAction, {})

  return (
    <Card>
      <CardHeader><CardTitle>{STEP_TITLES[stage]}</CardTitle></CardHeader>
      <CardBody>
        {stage === 'account' ? (
          <form action={finishSubmit} className="space-y-4">
            <input type="hidden" name="stage" value={stage} />
            <p className="text-[13px] leading-relaxed text-ink-secondary">
              Your investor profile is set up. You can browse offerings now; each one will check
              your eligibility against its own requirements before you can commit to it.
            </p>
            {finishState.error ? <Alert tone="critical">{finishState.error}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={finishPending}>
              {finishPending ? 'Finishing…' : 'Go to your dashboard'}
            </Button>
          </form>
        ) : (
          <form action={submit} className="space-y-4">
            <input type="hidden" name="stage" value={stage} />

            {stage === 'profile' ? (
              <>
                <Field label="Name this account invests under" htmlFor="displayName">
                  <Input id="displayName" name="displayName" required defaultValue={profile?.display_name} />
                </Field>
                <Field label="Investor type" htmlFor="investorType">
                  <Select id="investorType" name="investorType" defaultValue={profile?.investor_type ?? 'individual'}>
                    <option value="individual">Individual</option>
                    <option value="family_office">Family office</option>
                    <option value="llc">LLC</option>
                    <option value="trust">Trust</option>
                    <option value="institution">Institution</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="State of residence or formation" htmlFor="state" hint="Some offerings are restricted by state.">
                  <Input id="state" name="state" maxLength={2} placeholder="IL" defaultValue={profile?.state ?? ''} />
                </Field>
              </>
            ) : null}

            {stage === 'experience' ? (
              <>
                <Field label="Years investing" htmlFor="yearsInvesting">
                  <Input id="yearsInvesting" name="yearsInvesting" inputMode="numeric" defaultValue={profile?.years_investing ?? ''} />
                </Field>
                <Field label="Prior private placements" htmlFor="priorPlacements">
                  <Input id="priorPlacements" name="priorPlacements" inputMode="numeric" defaultValue={profile?.prior_private_placements ?? ''} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" name="healthcareExperience" defaultChecked={profile?.healthcare_experience} />
                  I have invested in or operated healthcare businesses before
                </label>
              </>
            ) : null}

            {stage === 'preferences' ? (
              <>
                <Field label="Typical investment size" htmlFor="typicalInvestment">
                  <Input id="typicalInvestment" name="typicalInvestment" inputMode="numeric" placeholder="100000" defaultValue={preferences?.typical_investment ?? ''} />
                </Field>
                <Field label="Investment range" htmlFor="investmentRange">
                  <Select id="investmentRange" name="investmentRange" defaultValue={preferences?.investment_range ?? ''}>
                    <option value="">No preference</option>
                    <option value="25k_50k">$25,000 – $50,000</option>
                    <option value="50k_100k">$50,000 – $100,000</option>
                    <option value="100k_250k">$100,000 – $250,000</option>
                    <option value="250k_500k">$250,000 – $500,000</option>
                    <option value="500k_plus">$500,000 and above</option>
                  </Select>
                </Field>
                <div>
                  <Label>Asset types</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {ASSET_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-[12px] text-ink">
                        <input type="checkbox" name="assetTypes" value={type} defaultChecked={preferences?.asset_types.includes(type)} />
                        {ASSET_LABELS[type] ?? type}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="States" htmlFor="states" hint="Comma separated. Leave blank for no geographic preference.">
                  <Input id="states" name="states" placeholder="IL, IN, WI" defaultValue={preferences?.states.join(', ')} />
                </Field>
                <div>
                  <Label>Capital position</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {(['common_equity', 'preferred_equity', 'mezzanine', 'senior_debt'] as const).map((position) => (
                      <label key={position} className="flex items-center gap-2 text-[12px] capitalize text-ink">
                        <input type="checkbox" name="capitalPositions" value={position} defaultChecked={preferences?.capital_positions.includes(position)} />
                        {position.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {stage === 'risk' ? (
              <>
                <Field label="Risk tolerance" htmlFor="riskTolerance">
                  <Select id="riskTolerance" name="riskTolerance" defaultValue={preferences?.risk_tolerance ?? ''}>
                    <option value="">Not stated</option>
                    <option value="conservative">Conservative — income first, capital preservation</option>
                    <option value="moderate">Moderate — balanced income and growth</option>
                    <option value="opportunistic">Opportunistic — accepts volatility for return</option>
                  </Select>
                </Field>
                <Field label="Income or appreciation" htmlFor="returnPreference">
                  <Select id="returnPreference" name="returnPreference" defaultValue={preferences?.return_preference ?? ''}>
                    <option value="">No preference</option>
                    <option value="income">Current income</option>
                    <option value="appreciation">Appreciation at exit</option>
                    <option value="balanced">Balanced</option>
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Target return, minimum" htmlFor="targetReturnMin" hint="Annual, as a percentage.">
                    <Input id="targetReturnMin" name="targetReturnMin" inputMode="numeric" placeholder="12" defaultValue={preferences?.target_return_min_pct ?? ''} />
                  </Field>
                  <Field label="Maximum leverage tolerated" htmlFor="maxLeverage" hint="Percentage of total capitalisation.">
                    <Input id="maxLeverage" name="maxLeverage" inputMode="numeric" placeholder="75" defaultValue={preferences?.max_leverage_pct ? preferences.max_leverage_pct * 100 : ''} />
                  </Field>
                  <Field label="Minimum hold" htmlFor="minHoldYears" hint="Years.">
                    <Input id="minHoldYears" name="minHoldYears" inputMode="numeric" placeholder="3" defaultValue={preferences?.min_hold_months ? preferences.min_hold_months / 12 : ''} />
                  </Field>
                  <Field label="Maximum hold" htmlFor="maxHoldYears" hint="Years.">
                    <Input id="maxHoldYears" name="maxHoldYears" inputMode="numeric" placeholder="7" defaultValue={preferences?.max_hold_months ? preferences.max_hold_months / 12 : ''} />
                  </Field>
                </div>
              </>
            ) : null}

            {stage === 'eligibility' ? (
              <>
                <Alert tone="neutral">
                  Most private offerings are limited to accredited investors. What you state here is
                  your own assertion; it is verified separately in the next steps, and an offering
                  that requires verification will not accept a self-assertion on its own.
                </Alert>
                <label className="flex items-start gap-2 text-[13px] text-ink">
                  <input type="checkbox" name="accredited" className="mt-0.5" defaultChecked={profile?.self_certified_accredited} />
                  I believe I meet the definition of an accredited investor
                </label>
                <Field label="On what basis" htmlFor="accreditationBasis">
                  <Select id="accreditationBasis" name="accreditationBasis" defaultValue={profile?.accreditation_basis ?? ''}>
                    <option value="">Not stated</option>
                    <option value="income">Income</option>
                    <option value="net_worth">Net worth</option>
                    <option value="professional_certification">Professional certification</option>
                    <option value="entity_assets">Entity assets</option>
                    <option value="knowledgeable_employee">Knowledgeable employee</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </>
            ) : null}

            {stage === 'kyc' ? (
              <Alert tone="neutral" title="Identity, know-your-customer and screening">
                These checks are performed by an external provider. CareCapital Exchange receives
                the provider&rsquo;s verdict and a reference, and does not store your identity
                documents. In this demonstration environment no real check is performed.
              </Alert>
            ) : null}

            {stage === 'accreditation' ? (
              <Alert tone="neutral" title="Accreditation verification">
                Accreditation is confirmed by a verification provider or by a letter from your
                attorney or accountant. In this demonstration environment the check is left pending
                so you can see how an offering behaves while it is outstanding.
              </Alert>
            ) : null}

            {stage === 'agreements' ? (
              <div className="space-y-2 text-[12px] leading-relaxed text-ink-secondary">
                <p>By continuing you acknowledge that:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>CareCapital Exchange is not a broker-dealer, investment adviser or funding portal, and does not recommend investments.</li>
                  <li>Private investments are illiquid, and you may lose your entire investment.</li>
                  <li>Projections shown on any offering are derived from assumptions the sponsor states, and are not forecasts or promises.</li>
                  <li>Each offering imposes its own eligibility requirements, which you must satisfy before committing.</li>
                </ul>
              </div>
            ) : null}

            {verifications.length > 0 && (stage === 'kyc' || stage === 'accreditation') ? (
              <div className="space-y-1.5">
                {verifications.map((verification) => (
                  <div key={verification.id} className="flex items-center justify-between text-[12px]">
                    <span className="capitalize text-ink-muted">{verification.kind}</span>
                    <Badge tone={verification.status === 'verified' ? 'positive' : verification.status === 'pending' ? 'warning' : 'neutral'}>
                      {verification.status === 'verified' ? <Check className="mr-1 inline size-3" /> : null}
                      {verification.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}

            {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? 'Saving…' : 'Continue'}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
