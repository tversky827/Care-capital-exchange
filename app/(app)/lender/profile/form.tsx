'use client'

import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { saveLenderProfileAction } from '../actions'

const PUBLISHABLE = [
  { key: 'description', label: 'Description of your institution' },
  { key: 'asset_types', label: 'Asset classes you lend on' },
  { key: 'states', label: 'States you lend in' },
  { key: 'loan_range', label: 'Typical loan size range' },
  { key: 'transaction_types', label: 'Transaction types you finance' },
  { key: 'typical_rate', label: 'Typical pricing range' },
  { key: 'typical_term', label: 'Typical term' },
  { key: 'contact', label: 'Direct contact details' },
]

export function ProfileForm({
  lender,
}: {
  lender: {
    institution_name: string
    institution_type: string
    description: string | null
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    public_profile_fields: string[]
  }
}) {
  return (
    <ActionForm action={saveLenderProfileAction} submitLabel="Save profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institution name" htmlFor="institution_name">
          <Input id="institution_name" name="institution_name" defaultValue={lender.institution_name} required />
        </Field>
        <Field label="Institution type" htmlFor="institution_type">
          <Select id="institution_type" name="institution_type" defaultValue={lender.institution_type}>
            <option value="bank">Bank</option>
            <option value="credit_union">Credit union</option>
            <option value="private_lender">Private lender</option>
            <option value="specialty_finance">Specialty finance</option>
            <option value="debt_fund">Debt fund</option>
            <option value="insurance">Insurance company</option>
            <option value="cmbs">CMBS</option>
            <option value="agency">Agency</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>

      <Field
        className="mt-4"
        label="Description"
        htmlFor="description"
        hint="How you want borrowers to understand your appetite. Published only if you tick it below."
      >
        <Textarea id="description" name="description" rows={4} defaultValue={lender.description ?? ''} />
      </Field>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Contact name" htmlFor="contact_name">
          <Input id="contact_name" name="contact_name" defaultValue={lender.contact_name ?? ''} />
        </Field>
        <Field label="Contact email" htmlFor="contact_email">
          <Input id="contact_email" name="contact_email" type="email" defaultValue={lender.contact_email ?? ''} />
        </Field>
        <Field label="Contact phone" htmlFor="contact_phone">
          <Input id="contact_phone" name="contact_phone" defaultValue={lender.contact_phone ?? ''} />
        </Field>
      </div>

      <fieldset className="mt-6 border-t border-line pt-5">
        <legend className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          Published to borrowers
        </legend>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Unticked fields are never shown to a borrower or to another lender, and are still used for
          matching.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PUBLISHABLE.map((option) => (
            <label key={option.key} className="flex items-center gap-2 border border-line px-3 py-2">
              <input
                type="checkbox"
                name="public_profile_fields"
                value={option.key}
                defaultChecked={lender.public_profile_fields.includes(option.key)}
                className="accent-[#1f4e79]"
              />
              <span className="text-[12px] text-ink-secondary">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  )
}
