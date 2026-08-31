import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Clock, Users } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { db } from '@/db'
import { format } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { catalogueFor, inCatalogue } from '@/lib/catalogue'
import { ensureAccount } from '@/services/practice/accounts'
import { balanceFor } from '@/services/practice/ledger'
import { GUIDE, GUIDE_SECONDS, PERSONAS } from '@/lib/sandbox/guide'
import { Alert, Badge, Card, CardBody, PageHeader, Section } from '@/components/ui/primitives'
import { ResetSandbox } from '../cash/forms'

export const metadata: Metadata = { title: 'Presentation mode' }
export const dynamic = 'force-dynamic'

/**
 * Presentation mode.
 *
 * A script, not a slideshow. Every step is a link into the ordinary product,
 * with one line of what to say and one line of what to point at — because the
 * thing being demonstrated is the product, and a guided overlay that sits on
 * top of it demonstrates the overlay.
 *
 * The running time is stated because the constraint is real: somebody has
 * given you five minutes, and knowing which step you are on and how long is
 * left is the difference between finishing and being cut off mid-sentence.
 */
export default async function PresentPage() {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) redirect('/investor')
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') redirect('/sandbox')

  const account = await ensureAccount(actor, environment)
  const [balance, store] = await Promise.all([balanceFor(account.id), db()])

  // A raise to run the script against: whichever open one in this catalogue
  // has the lowest minimum, so the amount typed on stage is a small number.
  const catalogue = catalogueFor(environment)
  const open = (await store.select('offerings', { where: { status: 'live' } }))
    .filter((offering) => inCatalogue(offering, catalogue))
    .sort((a, b) => (a.minimum_investment ?? 0) - (b.minimum_investment ?? 0))
  const subject = open[0] ?? null

  const positions = await store.count('practice_positions', { where: { account_id: account.id } })
  const minutes = Math.round(GUIDE_SECONDS / 60)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Presentation mode"
        title="A five-minute run through the product"
        description="Nine steps, each one a link into the ordinary interface. Read the left column, click the step, point at the right column."
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-4 text-[12px] text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-ink-muted" />
              About {minutes} minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 text-ink-muted" />
              {environment === 'demo' ? 'Fictional catalogue' : 'Real catalogue, virtual money'}
            </span>
            <span className="tnum">{format(balance)} of virtual cash</span>
          </span>
          {positions > 0 ? (
            <Badge tone="warning">
              {positions} holding{positions === 1 ? '' : 's'} already — reset below for a clean start
            </Badge>
          ) : (
            <Badge tone="positive">Clean state</Badge>
          )}
        </CardBody>
      </Card>

      {subject === null ? (
        <Alert tone="warning" title="Nothing open to demonstrate against">
          This catalogue has no raise currently taking investment, so the steps below have nowhere
          to point. In the demonstration catalogue that usually means the seed did not complete.
        </Alert>
      ) : null}

      <Section title="The script" description="Each step opens in the product. Come back here for the next one.">
        <CardBody className="space-y-2 p-0">
          {GUIDE.map((step, index) => (
            <Link
              key={step.key}
              href={step.href(subject?.id ?? null)}
              className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-sunken"
            >
              <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-ink-muted">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{step.title}</span>
                  <span className="tnum text-[11px] text-ink-muted">{step.seconds}s</span>
                </span>
                <span className="mt-1 grid gap-1 md:grid-cols-2">
                  <span className="text-[12px] leading-relaxed text-ink-secondary">
                    <span className="mr-1 text-[10px] uppercase tracking-[0.05em] text-ink-muted">Say</span>
                    {step.say}
                  </span>
                  <span className="text-[12px] leading-relaxed text-ink-muted">
                    <span className="mr-1 text-[10px] uppercase tracking-[0.05em] text-ink-muted">Point at</span>
                    {step.look}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </CardBody>
      </Section>

      <Section
        title="Switch perspective"
        description="The same platform from the other side. Uses the roles the product already has rather than a separate demonstration login."
      >
        <CardBody className="space-y-2">
          {PERSONAS.map((persona) => {
            const allowed =
              persona.requires === 'any'
              || (persona.requires === 'admin' && actor.isAdmin)
              || (persona.requires === 'sponsor' && actor.isBorrower)
            return (
              <div
                key={persona.key}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-2.5 last:border-b-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{persona.label}</span>
                  <span className="block text-[12px] leading-relaxed text-ink-muted">{persona.detail}</span>
                </span>
                {allowed ? (
                  <Link href={persona.href} className="shrink-0 text-[12px] font-medium text-accent hover:underline">
                    Open
                  </Link>
                ) : (
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    Needs {persona.requires === 'admin' ? 'an administrator' : 'an operator'} sign-in
                  </span>
                )}
              </div>
            )
          })}
          <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
            These use the platform&rsquo;s own roles. There is no separate demonstration login, so what
            each perspective can see is exactly what it can see in the live product.
          </p>
        </CardBody>
      </Section>

      <ResetSandbox holdings={positions} cashLabel={format(balance)} />
    </div>
  )
}
