'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Building2, Handshake, Landmark } from 'lucide-react'
import { Alert, Button, Card, Field, Input } from '@/components/ui/primitives'
import { registerAction, type AuthState } from '../actions'
import { cn } from '@/lib/utils/cn'

type Intent = 'find_financing' | 'provide_financing' | 'manage_for_clients'

const INTENTS: { key: Intent; label: string; detail: string; icon: typeof Building2 }[] = [
  {
    key: 'find_financing',
    label: 'Find financing',
    detail: 'I operate healthcare facilities and need debt capital.',
    icon: Building2,
  },
  {
    key: 'provide_financing',
    label: 'Provide financing',
    detail: 'I lend to healthcare operators and want qualified opportunities.',
    icon: Landmark,
  },
  {
    key: 'manage_for_clients',
    label: 'Manage financing for clients',
    detail: 'I am a broker or advisor placing debt on behalf of operators.',
    icon: Handshake,
  },
]

export function SignupForm({ initialIntent }: { initialIntent: Intent }) {
  const [intent, setIntent] = useState<Intent>(initialIntent)
  const [state, submit, pending] = useActionState<AuthState, FormData>(registerAction, {})

  return (
    <Card className="w-full max-w-lg p-6">
      <h1 className="text-[18px] font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-[12px] text-ink-muted">
        What you are here to do determines the workspace we set up.
      </p>

      <form action={submit} className="mt-6 space-y-5">
        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-ink-secondary">
            What are you here to do?
          </legend>
          <div className="space-y-2">
            {INTENTS.map((option) => (
              <label
                key={option.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 border p-3 transition-colors',
                  intent === option.key
                    ? 'border-accent bg-accent-soft/50'
                    : 'border-line hover:border-line-strong hover:bg-surface-sunken/60',
                )}
              >
                <input
                  type="radio"
                  name="intent"
                  value={option.key}
                  checked={intent === option.key}
                  onChange={() => setIntent(option.key)}
                  className="mt-0.5 accent-[#1f4e79]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <option.icon className="size-3.5 text-ink-muted" />
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
                    {option.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" required autoComplete="name" />
          </Field>
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" autoComplete="organization-title" />
          </Field>
        </div>

        <Field
          label={intent === 'provide_financing' ? 'Institution name' : 'Organisation name'}
          htmlFor="companyName"
        >
          <Input id="companyName" name="companyName" required autoComplete="organization" />
        </Field>

        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
        >
          <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={10} />
        </Field>

        {intent === 'provide_financing' ? (
          <Alert tone="neutral">
            Lender organisations are verified by a platform administrator before any borrower deal,
            document or identity becomes visible. You can build your profile and lending box straight
            away.
          </Alert>
        ) : null}

        {state.error ? <Alert tone="critical">{state.error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="text-[11px] leading-relaxed text-ink-muted">
          By creating an account you acknowledge that CareCapital Exchange does not lend, approve
          credit or commit to any financing, and that financing indications submitted through the
          platform are indications of interest rather than commitments.
        </p>
      </form>

      <p className="mt-5 border-t border-line pt-4 text-[12px] text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link>
      </p>
    </Card>
  )
}
