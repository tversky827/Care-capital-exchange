import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { currentEnvironment } from '@/lib/environment'
import { ensureAccount } from '@/services/practice/accounts'
import { readinessFor, GLOSSARY } from '@/services/practice/readiness'
import { Alert, Card, CardBody, PageHeader, Section } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Learn' }
export const dynamic = 'force-dynamic'

/**
 * The education panel.
 *
 * Two halves: what you have actually done in the sandbox, and the vocabulary
 * for the things you were looking at while you did it.
 *
 * The checklist measures activity, never performance. A score that rose when a
 * simulated investment did well would be teaching that picking winners in a
 * simulation means something, and it means nothing — the simulation runs on
 * each sponsor's own assumptions, so "did well" reduces to "had the most
 * optimistic ones".
 */
export default async function LearnPage() {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) redirect('/investor')
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') redirect('/sandbox')

  const account = await ensureAccount(actor, environment)
  const readiness = await readinessFor(account)
  const complete = readiness.done === readiness.total

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Learn"
        description="What you have tried so far, and the words for what you were looking at."
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">
              {readiness.done} of {readiness.total} things tried
            </span>
            <span className="text-[11px] text-ink-muted">Activity, not performance</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-sunken">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${Math.round((readiness.done / readiness.total) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            This counts what you have done in the sandbox and nothing else. It is not a
            qualification, an accreditation or a permission, it has no effect on whether you may
            invest for real, and no operator ever sees it. It deliberately ignores how your practice
            portfolio performed: the simulation runs on each sponsor&rsquo;s own assumptions, so a
            good result means you picked the most optimistic ones.
          </p>
        </CardBody>
      </Card>

      <Section title="Things worth trying once">
        <CardBody className="space-y-3">
          {readiness.steps.map((step) => (
            <div key={step.key} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  step.done ? 'border-positive bg-positive text-white' : 'border-line'
                }`}
                aria-hidden
              >
                {step.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] ${step.done ? 'text-ink' : 'font-medium text-ink'}`}>
                  {step.label}
                </span>
                <span className="block text-[12px] leading-relaxed text-ink-muted">{step.detail}</span>
              </span>
            </div>
          ))}
        </CardBody>
      </Section>

      {complete ? (
        <Alert tone="positive" title="You have been round the whole thing">
          Everything the sandbox can show you, you have seen. If you want to invest for real, that
          runs through the platform&rsquo;s own onboarding — eligibility, verification and funding —
          and none of what you built here carries across.{' '}
          <Link href="/investor/onboarding" className="font-medium underline">Open an investment account</Link>.
        </Alert>
      ) : null}

      <Section
        title="The vocabulary"
        description="What each number is, and the thing an experienced investor already knows about it."
      >
        <CardBody className="space-y-4">
          {GLOSSARY.map((term) => (
            <div key={term.key} className="border-b border-line pb-3.5 last:border-b-0 last:pb-0">
              <p className="text-[13px] font-semibold text-ink">{term.label}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{term.short}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{term.detail}</p>
            </div>
          ))}
        </CardBody>
      </Section>
    </div>
  )
}
