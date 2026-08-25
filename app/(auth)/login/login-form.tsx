'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { Alert, Badge, Button, Card, Field, Input, Separator } from '@/components/ui/primitives'
import { demoLoginAction, loginAction, magicLinkAction, type AuthState } from '../actions'
import { titleize } from '@/lib/utils/format'

interface DemoAccount {
  email: string
  name: string
  role: string
  company: string
  companyType: string
}

export function LoginForm({
  demoAccounts, emailLinkEnabled,
}: { demoAccounts: DemoAccount[]; emailLinkEnabled: boolean }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [passwordState, passwordSubmit, passwordPending] = useActionState<AuthState, FormData>(loginAction, {})
  const [magicState, magicSubmit, magicPending] = useActionState<AuthState, FormData>(magicLinkAction, {})
  const [demoState, demoSubmit, demoPending] = useActionState<AuthState, FormData>(demoLoginAction, {})

  return (
    <div className="w-full max-w-4xl">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card className="p-6">
          <h1 className="text-[18px] font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-[12px] text-ink-muted">Access your deals, pipeline and data room.</p>

          <div className="mt-5 flex gap-1 border-b border-line">
            <TabButton active={mode === 'password'} onClick={() => setMode('password')} icon={<KeyRound className="size-3.5" />}>
              Password
            </TabButton>
            {emailLinkEnabled ? (
              <TabButton active={mode === 'magic'} onClick={() => setMode('magic')} icon={<Mail className="size-3.5" />}>
                Email link
              </TabButton>
            ) : null}
          </div>

          {mode === 'password' || !emailLinkEnabled ? (
            <form action={passwordSubmit} className="mt-5 space-y-4">
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" name="password" type="password" required autoComplete="current-password" />
              </Field>
              {passwordState.error ? <Alert tone="critical">{passwordState.error}</Alert> : null}
              <Button type="submit" variant="primary" className="w-full" disabled={passwordPending}>
                {passwordPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form action={magicSubmit} className="mt-5 space-y-4">
              <Field label="Email" htmlFor="magic-email" hint="We will send a link that signs you in without a password.">
                <Input id="magic-email" name="email" type="email" required autoComplete="email" autoFocus />
              </Field>
              {magicState.error ? <Alert tone="critical">{magicState.error}</Alert> : null}
              {magicState.notice ? (
                <Alert tone="positive" title="Check your email">
                  {magicState.notice}
                  {magicState.magicLink ? (
                    <p className="mt-2">
                      Mail delivery is not configured in this environment, so the link is
                      here for development:{' '}
                      <Link href={magicState.magicLink} className="break-all font-medium underline">
                        open sign-in link
                      </Link>
                    </p>
                  ) : null}
                </Alert>
              ) : null}
              <Button type="submit" variant="primary" className="w-full" disabled={magicPending}>
                {magicPending ? 'Sending…' : 'Email me a link'}
              </Button>
            </form>
          )}

          <Separator className="my-5" />
          <p className="text-[12px] text-ink-muted">
            No account?{' '}
            <Link href="/signup" className="font-medium text-accent hover:underline">Create one</Link>
          </p>
        </Card>

        {demoAccounts.length ? (
          <Card className="self-start p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink">Demonstration accounts</h2>
              <Badge tone="warning">Demo data</Badge>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              This environment is seeded with fictional companies, deals and lenders. Sign in as any
              of them to see the product from that side of the marketplace.
            </p>

            <div className="mt-4 space-y-2">
              {demoAccounts.map((account) => (
                <form key={account.email} action={demoSubmit}>
                  <input type="hidden" name="email" value={account.email} />
                  <button
                    type="submit"
                    disabled={demoPending}
                    className="flex w-full items-center justify-between gap-4 border border-line px-3 py-2.5 text-left transition-colors hover:border-accent-line hover:bg-accent-soft/40 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{account.company}</span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {account.name} · {account.email}
                      </span>
                    </span>
                    <Badge tone={account.companyType === 'lender' ? 'accent' : account.companyType === 'admin' ? 'neutral' : 'positive'}>
                      {titleize(account.companyType)}
                    </Badge>
                  </button>
                </form>
              ))}
            </div>

            {demoState.error ? <Alert tone="critical" className="mt-3">{demoState.error}</Alert> : null}

            <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
              Password for every demonstration account is <code className="rounded-[2px] bg-surface-sunken px-1 py-0.5 font-mono">DemoPass123!</code>
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function TabButton({
  active, onClick, children, icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-medium transition-colors ${
        active ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
