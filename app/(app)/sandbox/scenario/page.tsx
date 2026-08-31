import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { db } from '@/db'
import { currentEnvironment } from '@/lib/environment'
import { catalogueFor, inCatalogue } from '@/lib/catalogue'
import { projectOffering } from '@/services/equity/analysis'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { accountFor } from '@/services/practice/accounts'
import { Alert, Card, CardBody, EmptyState, PageHeader, Section } from '@/components/ui/primitives'
import { formatDate, formatPercent, formatRatio } from '@/lib/utils/format'
import { ScenarioDials } from './dials'

export const metadata: Metadata = { title: 'What if?' }
export const dynamic = 'force-dynamic'

/**
 * What if.
 *
 * The point of the exercise is not the answer, it is which dial moves the
 * answer most. An investor who discovers that this deal survives a five-point
 * occupancy drop but not a one-point rate rise has learned the actual shape of
 * the risk, which no summary paragraph conveys.
 */
export default async function ScenarioPage({
  searchParams,
}: {
  searchParams: Promise<{ offering?: string }>
}) {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) redirect('/investor')
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') redirect('/sandbox')

  const catalogue = catalogueFor(environment)
  const store = await db()
  const open = (await store.select('offerings', { where: { status: 'live' } }))
    .filter((offering) => inCatalogue(offering, catalogue))

  const params = await searchParams
  const selected = open.find((offering) => offering.id === params.offering) ?? open[0] ?? null

  if (!selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="What if?" />
        <EmptyState
          title="Nothing open to model"
          description="This catalogue has no raise currently taking investment."
        />
      </div>
    )
  }

  const [projection, snapshot, account] = await Promise.all([
    projectOffering(selected.id),
    buildSnapshot(selected.deal_id),
    accountFor(actor, environment),
  ])

  const saved = account
    ? (await store.select('practice_scenarios', {
      where: { account_id: account.id, offering_id: selected.id },
      orderBy: { field: 'created_at', dir: 'desc' },
    })).slice(0, 6)
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="What if?"
        description="Move an assumption and watch what the model does. The dial that moves the answer most is where the risk actually is."
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <label htmlFor="pick" className="text-[12px] font-medium text-ink">Raise</label>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {open.slice(0, 8).map((offering) => (
              <Link
                key={offering.id}
                href={`/sandbox/scenario?offering=${offering.id}`}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${
                  offering.id === selected.id
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-line text-ink-secondary hover:bg-surface-sunken'
                }`}
              >
                {offering.name}
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      <Alert tone="neutral">
        This is an educational model, not investment advice and not a prediction. It shows what the
        operator&rsquo;s own stated assumptions produce when one of them is changed. It says nothing
        about how likely any of these outcomes is.
      </Alert>

      <ScenarioDials
        offeringId={selected.id}
        baseIrrPct={projection?.irrPct ?? null}
        baseMultiple={projection?.equityMultiple ?? null}
        baseDscr={snapshot?.summary.dscr ?? null}
      />

      {saved.length > 0 ? (
        <Section title="What you have tried" description="Your own working. No operator sees this.">
          <CardBody className="space-y-2">
            {saved.map((row) => {
              const irr = row.results.irr_pct
              const multiple = row.results.equity_multiple
              return (
                <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block text-[12px] text-ink">{row.label}</span>
                    <span className="block text-[11px] text-ink-muted">{formatDate(row.created_at)}</span>
                  </span>
                  <span className="tnum shrink-0 text-[12px] text-ink-secondary">
                    {typeof irr === 'number' ? formatPercent(irr) : '—'}
                    {typeof multiple === 'number' ? ` · ${formatRatio(multiple)}` : ''}
                  </span>
                </div>
              )
            })}
          </CardBody>
        </Section>
      ) : null}
    </div>
  )
}
