'use client'

import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { saveLendingBoxAction } from '../actions'
import { titleize } from '@/lib/utils/format'
import type { LendingBox } from '@/types'

export function LendingBoxForm({
  box, assetTypes, transactionTypes,
}: {
  box: LendingBox | null
  assetTypes: string[]
  transactionTypes: string[]
}) {
  return (
    <ActionForm action={saveLendingBoxAction} submitLabel="Save lending criteria">
      <fieldset>
        <legend className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          Boundaries
        </legend>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          A deal outside any of these is never sent to you.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Minimum loan" htmlFor="min_loan"><Input id="min_loan" name="min_loan" defaultValue={box?.min_loan ?? ''} placeholder="3000000" /></Field>
          <Field label="Maximum loan" htmlFor="max_loan"><Input id="max_loan" name="max_loan" defaultValue={box?.max_loan ?? ''} placeholder="25000000" /></Field>
          <Field label="Preferred deal size" htmlFor="preferred_deal_size" hint="Your typical check.">
            <Input id="preferred_deal_size" name="preferred_deal_size" defaultValue={box?.preferred_deal_size ?? ''} />
          </Field>
          <Field label="Maximum LTV %" htmlFor="max_ltv_pct"><Input id="max_ltv_pct" name="max_ltv_pct" defaultValue={box?.max_ltv_pct ?? ''} placeholder="80" /></Field>
          <Field label="Minimum DSCR" htmlFor="min_dscr"><Input id="min_dscr" name="min_dscr" defaultValue={box?.min_dscr ?? ''} placeholder="1.35" /></Field>
          <Field label="Minimum debt yield %" htmlFor="min_debt_yield_pct"><Input id="min_debt_yield_pct" name="min_debt_yield_pct" defaultValue={box?.min_debt_yield_pct ?? ''} placeholder="11" /></Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="States you lend in" htmlFor="states" hint="Comma separated. Leave blank for nationwide.">
            <Input id="states" name="states" defaultValue={box?.states.join(', ') ?? ''} placeholder="IL, IN, WI, MO" />
          </Field>
          <Field label="States you exclude" htmlFor="excluded_states" hint="Applied even if the state appears above.">
            <Input id="excluded_states" name="excluded_states" defaultValue={box?.excluded_states.join(', ') ?? ''} />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Asset types" htmlFor="asset_types" hint="Ctrl/Cmd-click for multiple.">
            <MultiSelect id="asset_types" name="asset_types" options={assetTypes} selected={box?.asset_types ?? []} />
          </Field>
          <Field label="Excluded asset types" htmlFor="excluded_asset_types">
            <MultiSelect id="excluded_asset_types" name="excluded_asset_types" options={assetTypes} selected={box?.excluded_asset_types ?? []} />
          </Field>
          <Field label="Transaction types" htmlFor="transaction_types">
            <MultiSelect id="transaction_types" name="transaction_types" options={transactionTypes} selected={box?.transaction_types ?? []} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-line pt-5">
        <legend className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          Preferences
        </legend>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          A deal that misses one of these is flagged as a concern, not excluded.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Minimum occupancy %" htmlFor="min_occupancy_pct"><Input id="min_occupancy_pct" name="min_occupancy_pct" defaultValue={box?.min_occupancy_pct ?? ''} placeholder="80" /></Field>
          <Field label="Maximum Medicaid %" htmlFor="max_medicaid_pct"><Input id="max_medicaid_pct" name="max_medicaid_pct" defaultValue={box?.max_medicaid_pct ?? ''} placeholder="70" /></Field>
          <Field label="Minimum private pay %" htmlFor="min_private_pay_pct"><Input id="min_private_pay_pct" name="min_private_pay_pct" defaultValue={box?.min_private_pay_pct ?? ''} /></Field>
          <Field label="Minimum operator years" htmlFor="min_operator_years"><Input id="min_operator_years" name="min_operator_years" defaultValue={box?.min_operator_years ?? ''} placeholder="5" /></Field>
          <Field label="Minimum facilities operated" htmlFor="min_facilities_operated"><Input id="min_facilities_operated" name="min_facilities_operated" defaultValue={box?.min_facilities_operated ?? ''} placeholder="2" /></Field>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-line pt-5">
        <legend className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          Execution and requirements
        </legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Typical rate, low %" htmlFor="typical_rate_low_pct"><Input id="typical_rate_low_pct" name="typical_rate_low_pct" defaultValue={box?.typical_rate_low_pct ?? ''} /></Field>
          <Field label="Typical rate, high %" htmlFor="typical_rate_high_pct"><Input id="typical_rate_high_pct" name="typical_rate_high_pct" defaultValue={box?.typical_rate_high_pct ?? ''} /></Field>
          <Field label="Typical term (months)" htmlFor="typical_term_months"><Input id="typical_term_months" name="typical_term_months" defaultValue={box?.typical_term_months ?? ''} placeholder="60" /></Field>
          <Field label="Appraisal required" htmlFor="requires_appraisal">
            <Select id="requires_appraisal" name="requires_appraisal" defaultValue={box?.requires_appraisal === false ? 'no' : 'yes'}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Phase I environmental required" htmlFor="requires_environmental">
            <Select id="requires_environmental" name="requires_environmental" defaultValue={box?.requires_environmental ? 'yes' : 'no'}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Years of tax returns required" htmlFor="required_tax_return_years">
            <Input id="required_tax_return_years" name="required_tax_return_years" defaultValue={box?.required_tax_return_years ?? 2} />
          </Field>
        </div>

        <Field className="mt-4" label="Box name" htmlFor="name">
          <Input id="name" name="name" defaultValue={box?.name ?? 'Primary lending box'} />
        </Field>
        <Field
          className="mt-4"
          label="Notes"
          htmlFor="notes"
          hint="Shown to borrowers on your profile if you publish your description. Useful for stating where you flex."
        >
          <Textarea id="notes" name="notes" rows={3} defaultValue={box?.notes ?? ''} />
        </Field>
      </fieldset>
    </ActionForm>
  )
}

function MultiSelect({
  id, name, options, selected,
}: {
  id: string
  name: string
  options: string[]
  selected: string[]
}) {
  return (
    <select
      id={id}
      name={name}
      multiple
      size={6}
      defaultValue={selected}
      className="w-full border border-line-strong bg-surface px-2 py-1.5 text-[12px] text-ink rounded-[3px] focus:border-accent"
    >
      {options.map((option) => (
        <option key={option} value={option}>{titleize(option)}</option>
      ))}
    </select>
  )
}
