'use client'

import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import {
  changePasswordAction, updateCompanyAction, updateNotificationPreferencesAction, updateProfileAction,
} from './actions'
import type { NotificationPreferences } from '@/types'

const MUTABLE_EVENTS = [
  { key: 'document.processed', label: 'Document finished processing' },
  { key: 'analysis.complete', label: 'Underwriting analysis completed' },
  { key: 'issue.detected', label: 'An item needs attention' },
  { key: 'match.found', label: 'New lender match' },
  { key: 'lender.viewed_deal', label: 'A lender opened your deal' },
  { key: 'indication.received', label: 'Financing indication received' },
  { key: 'message.received', label: 'New message' },
]

export function ProfileForm({
  user,
}: {
  user: { full_name: string; title: string | null; phone: string | null; email: string }
}) {
  return (
    <ActionForm action={updateProfileAction} submitLabel="Save profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={user.full_name} required />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={user.title ?? ''} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={user.phone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Changing your sign-in address is not supported in this environment.">
          <Input id="email" defaultValue={user.email} disabled />
        </Field>
      </div>
    </ActionForm>
  )
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} submitLabel="Change password">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="current_password">
          <Input id="current_password" name="current_password" type="password" required autoComplete="current-password" />
        </Field>
        <Field
          label="New password"
          htmlFor="new_password"
          hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
        >
          <Input id="new_password" name="new_password" type="password" required autoComplete="new-password" minLength={10} />
        </Field>
      </div>
    </ActionForm>
  )
}

export function NotificationForm({ preferences }: { preferences: NotificationPreferences }) {
  return (
    <ActionForm action={updateNotificationPreferencesAction} submitLabel="Save preferences">
      <Field label="Email notifications" htmlFor="email">
        <Select id="email" name="email" defaultValue={preferences.email === false ? 'no' : 'yes'}>
          <option value="yes">Send me email as well as in-app</option>
          <option value="no">In-app only</option>
        </Select>
      </Field>

      <fieldset className="mt-4">
        <legend className="text-[12px] font-medium text-ink-secondary">Mute these events</legend>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Muted events are not delivered by any channel. Deal status changes and distributions cannot
          be muted.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {MUTABLE_EVENTS.map((event) => (
            <label key={event.key} className="flex items-center gap-2 border border-line px-3 py-2">
              <input
                type="checkbox"
                name="muted_events"
                value={event.key}
                defaultChecked={preferences.muted_events?.includes(event.key)}
                className="accent-[#1f4e79]"
              />
              <span className="text-[12px] text-ink-secondary">{event.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  )
}

export function CompanyForm({
  company,
}: {
  company: {
    name: string
    website: string | null
    description: string | null
    address_line1: string | null
    city: string | null
    state: string | null
    zip: string | null
  }
}) {
  return (
    <ActionForm action={updateCompanyAction} submitLabel="Save organisation">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation name" htmlFor="name">
          <Input id="name" name="name" defaultValue={company.name} required />
        </Field>
        <Field label="Website" htmlFor="website">
          <Input id="website" name="website" defaultValue={company.website ?? ''} placeholder="https://" />
        </Field>
        <Field label="Address" htmlFor="address_line1">
          <Input id="address_line1" name="address_line1" defaultValue={company.address_line1 ?? ''} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={company.city ?? ''} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" defaultValue={company.state ?? ''} maxLength={2} />
        </Field>
        <Field label="ZIP" htmlFor="zip">
          <Input id="zip" name="zip" defaultValue={company.zip ?? ''} />
        </Field>
      </div>
      <Field className="mt-4" label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={3} defaultValue={company.description ?? ''} />
      </Field>
    </ActionForm>
  )
}
