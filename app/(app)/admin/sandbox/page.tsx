import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { sandboxUsage } from '@/services/practice/analytics'
import { Alert, CardBody, PageHeader, Section } from '@/components/ui/primitives'
import { formatPercent } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Sandbox usage' }
export const dynamic = 'force-dynamic'

/**
 * What the sandbox is used for.
 *
 * Counts, and only counts. The question worth answering is whether people who
 * open a practice account get as far as simulating a distribution — the point
 * where the product stops being a listing site and starts being a thing that
 * shows you what you would own. Everything here is answerable without knowing
 * who anybody is.
 */
export default async function AdminSandboxPage() {
  const actor = await requireActor()
  if (!actor.isAdmin) notFound()
  if (!isAvailable('SANDBOX_ENABLED')) notFound()

  const [practice, demo] = await Promise.all([
    sandboxUsage('practice'),
    sandboxUsage('demo'),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Sandbox usage"
        description="How far people get. Counts only — nothing here identifies anybody."
      />

      <Alert tone="neutral">
        No sandbox activity is attributed to a person on this page, and nothing about a practice
        portfolio is visible to an operator anywhere in the product. A practice portfolio is a
        record of what somebody was considering, which is at least as private as what they did.
      </Alert>

      {[
        { label: 'Practice — real catalogue, virtual money', usage: practice },
        { label: 'Demonstration — fictional catalogue', usage: demo },
      ].map(({ label, usage }) => (
        <Section key={label} title={label}>
          <CardBody className="p-0">
            <dl className="data-grid grid-cols-2 lg:grid-cols-4">
              <Figure label="Accounts opened" value={usage.accountsOpened} />
              <Figure label="Reached an investment" value={formatPercent(usage.investedShare * 100)} hint="of accounts opened" />
              <Figure label="Investments" value={usage.investments} />
              <Figure label="Distributions simulated" value={usage.distributions} />
              <Figure label="Sales simulated" value={usage.exits} />
              <Figure label="Scenarios run" value={usage.scenarios} />
              <Figure label="Raises watchlisted" value={usage.watchlisted} />
              <Figure label="Portfolios reset" value={usage.resets} />
            </dl>
          </CardBody>
        </Section>
      ))}
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-1 text-[18px] font-semibold text-ink">{value}</dd>
      {hint ? <dd className="mt-0.5 text-[11px] text-ink-muted">{hint}</dd> : null}
    </div>
  )
}
