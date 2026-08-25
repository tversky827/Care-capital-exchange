'use client'

import { useActionState } from 'react'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Label, Select,
} from '@/components/ui/primitives'
import { ASSET_TYPES } from '@/types'
import { requestVerificationAction, updatePreferencesAction } from '../actions'
import type { ActionState } from '@/app/(app)/deals/actions'
import type { InvestorPreferences, InvestorProfile, InvestorVerification } from '@/types/equity'

export function ProfileForm({
  profile, preferences, verifications,
}: {
  profile: InvestorProfile
  preferences: InvestorPreferences | null
  verifications: InvestorVerification[]
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(updatePreferencesAction, {})
  const [verifyState, verifySubmit, verifyPending] = useActionState<ActionState, FormData>(requestVerificationAction, {})

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          {(['identity', 'kyc', 'aml', 'accreditation'] as const).map((kind) => {
            const record = verifications.find((v) => v.kind === kind)
            return (
              <div key={kind} className="flex items-center justify-between gap-3 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium capitalize text-ink">{kind}</div>
                  {record?.detail ? <p className="text-[11px] text-ink-muted">{record.detail}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={record?.status === 'verified' ? 'positive' : record?.status === 'pending' ? 'warning' : 'neutral'}>
                    {(record?.status ?? 'not verified').replace(/_/g, ' ')}
                  </Badge>
                  {record?.status !== 'verified' ? (
                    <form action={verifySubmit}>
                      <input type="hidden" name="kind" value={kind} />
                      <Button type="submit" size="sm" disabled={verifyPending}>Run check</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            )
          })}
          {verifyState.error ? <Alert tone="critical">{verifyState.error}</Alert> : null}
          {verifyState.success ? <Alert tone="positive">{verifyState.success}</Alert> : null}
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Checks are performed by an external provider. CareCapital Exchange stores the
            provider&rsquo;s verdict and reference, not your identity documents.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Investment preferences</CardTitle></CardHeader>
        <CardBody>
          <form action={submit} className="space-y-4">
            <Field label="Typical investment size" htmlFor="typicalInvestment">
              <Input id="typicalInvestment" name="typicalInvestment" inputMode="numeric" defaultValue={preferences?.typical_investment ?? ''} />
            </Field>
            <div>
              <Label>Asset types</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {ASSET_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-[12px] capitalize text-ink">
                    <input type="checkbox" name="assetTypes" value={type} defaultChecked={preferences?.asset_types.includes(type)} />
                    {type.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>
            <Field label="States" htmlFor="states" hint="Comma separated.">
              <Input id="states" name="states" defaultValue={preferences?.states.join(', ')} />
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target return, minimum" htmlFor="targetReturnMin">
                <Input id="targetReturnMin" name="targetReturnMin" inputMode="numeric" defaultValue={preferences?.target_return_min_pct ?? ''} />
              </Field>
              <Field label="Risk tolerance" htmlFor="riskTolerance">
                <Select id="riskTolerance" name="riskTolerance" defaultValue={preferences?.risk_tolerance ?? ''}>
                  <option value="">Not stated</option>
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="opportunistic">Opportunistic</option>
                </Select>
              </Field>
            </div>
            {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
            {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save preferences'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardBody className="space-y-1.5 text-[13px]">
          <Row label="Investing as" value={profile.display_name} />
          <Row label="Investor type" value={profile.investor_type.replace(/_/g, ' ')} />
          <Row label="State" value={profile.state ?? 'Not stated'} />
          <Row label="Self-certified accredited" value={profile.self_certified_accredited ? 'Yes' : 'No'} />
        </CardBody>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="capitalize text-ink">{value}</span>
    </div>
  )
}
