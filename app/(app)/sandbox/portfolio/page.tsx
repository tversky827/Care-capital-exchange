import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { activityFor, ensureAccount } from '@/services/practice/accounts'
import { diversification, portfolioFor, type PracticeConcentration } from '@/services/practice/portfolio'
import {
  Alert, Badge, Card, CardBody, EmptyState, PageHeader, Section,
} from '@/components/ui/primitives'
import { formatDate, formatPercent, formatRatio } from '@/lib/utils/format'
import { Simulate } from './simulate'

export const metadata: Metadata = { title: 'Practice portfolio' }
export const dynamic = 'force-dynamic'

/**
 * The hypothetical portfolio.
 *
 * Every figure on this page describes something that did not happen, and the
 * page says so once at the top rather than tagging each number — a label
 * repeated forty times stops being read by the fifth.
 *
 * Holdings are carried at cost, never at an estimate of value. The live
 * product shows a sponsor's estimate and is careful to call it an opinion;
 * inventing one here would teach a person to read a number the real product
 * treats with more caution than that.
 */
export default async function SandboxPortfolioPage() {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) redirect('/investor')
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') redirect('/sandbox')

  const account = await ensureAccount(actor, environment)
  const [portfolio, activity] = await Promise.all([
    portfolioFor(account.id),
    activityFor(account.id),
  ])
  const spread = diversification(portfolio)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title="Practice portfolio"
        description="What a portfolio built this way would look like. Nothing on this page happened."
      />

      <Alert tone="neutral" title="Everything here is hypothetical">
        These holdings are simulated. No securities are owned, no distribution has been received,
        and no sale has occurred. Amounts shown are derived from assumptions each sponsor has
        stated, run through the same deterministic model the live product uses. They are not actual
        performance, they do not predict actual performance, and they are not advice.
      </Alert>

      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure label="Account value" value={format(portfolio.accountValueCents)} hint="cash plus holdings at cost" />
          <Figure label="Virtual cash" value={format(portfolio.cashCents)} hint="not deployed" />
          <Figure label="Invested" value={format(portfolio.investedCents)} hint={`${portfolio.active} active, ${portfolio.exited} exited`} />
          <Figure
            label="Simulated back"
            value={format(cents(portfolio.distributionsCents + portfolio.exitProceedsCents))}
            hint={
              portfolio.hypotheticalMultiple !== null
                ? `${formatRatio(portfolio.hypotheticalMultiple)} on every dollar`
                : 'nothing yet'
            }
          />
        </dl>
        {portfolio.hypotheticalIrrPct !== null ? (
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-muted">
            Hypothetical rate: {formatPercent(portfolio.hypotheticalIrrPct)} a year, measured across
            the quarters simulated rather than the time you spent clicking
            {portfolio.active > 0
              ? ', and assuming everything still held were sold today for exactly what was paid for it'
              : ''}
            . Nothing here is marked up to an estimate of value.
          </p>
        ) : null}
      </Card>

      {portfolio.holdings.length === 0 ? (
        <EmptyState
          title="Nothing held yet"
          description="Open an opportunity and use the practice ticket. Your virtual cash goes down, a holding appears here, and you can simulate what it would pay."
          action={<Link href="/investments" className="text-[13px] font-medium text-accent hover:underline">Browse opportunities</Link>}
        />
      ) : (
        <Section title="Holdings" description="Each one can be advanced a quarter at a time, or taken to its sale.">
          <CardBody className="space-y-3">
            {portfolio.holdings.map((holding) => (
              <div key={holding.position.id} className="rounded border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/investments/${holding.position.offering_id}`}
                      className="text-[13px] font-medium text-accent hover:underline"
                    >
                      {holding.offering?.name ?? 'An investment'}
                    </Link>
                    <p className="text-[11px] text-ink-muted">
                      {[
                        holding.facility?.state,
                        holding.sponsor?.legal_entity,
                        `since ${formatDate(holding.position.acquired_at)}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge tone={holding.position.status === 'exited' ? 'neutral' : 'positive'}>
                    {holding.position.status === 'exited' ? 'Exited' : 'Held'}
                  </Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
                  <Cell label="Invested" value={format(cents(holding.position.invested_cents))} />
                  <Cell label="Distributions" value={format(cents(holding.position.distributions_cents))} />
                  <Cell label="Sale proceeds" value={format(cents(holding.position.exit_proceeds_cents))} />
                  <Cell
                    label="Back so far"
                    value={
                      holding.multiple === null ? '—' : `${formatRatio(holding.multiple)}`
                    }
                  />
                </dl>

                <div className="mt-3 border-t border-line pt-3">
                  <Simulate
                    positionId={holding.position.id}
                    exited={holding.position.status === 'exited'}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Section>
      )}

      {portfolio.holdings.length > 0 ? (
        <>
          <Section
            title="How spread it is"
            description="Against the exercise's own rule of thumb. Not a judgement about whether this is a good portfolio."
          >
            <CardBody className="space-y-2.5">
              {spread.rules.map((rule) => (
                <div key={rule.key} className="flex items-start gap-2">
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${rule.met ? 'bg-positive' : 'bg-line-strong'}`}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-[12px] font-medium text-ink">{rule.label}</span>
                    <span className="block text-[11px] text-ink-muted">{rule.detail}</span>
                  </span>
                </div>
              ))}
            </CardBody>
          </Section>

          <div className="grid gap-4 md:grid-cols-3">
            <Concentration title="By sponsor" rows={portfolio.bySponsor} />
            <Concentration title="By state" rows={portfolio.byState} />
            <Concentration title="By asset type" rows={portfolio.byAssetType} />
          </div>
        </>
      ) : null}

      <Section title="Everything you have done" description="The complete history of this sandbox account.">
        <CardBody className="space-y-2.5">
          {activity.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nothing yet.</p>
          ) : (
            activity.map((event) => (
              <div key={event.id} className="border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                <p className="text-[12px] leading-relaxed text-ink">{event.summary}</p>
                <p className="text-[11px] text-ink-muted">{formatDate(event.created_at)}</p>
              </div>
            ))
          )}
        </CardBody>
      </Section>
    </div>
  )
}

function Concentration({ title, rows }: { title: string; rows: PracticeConcentration[] }) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <p className="text-[12px] font-semibold text-ink">{title}</p>
        {rows.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Nothing invested.</p>
        ) : (
          rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-ink-secondary">{row.label}</span>
                <span className="tnum shrink-0 font-medium text-ink">{formatPercent(row.share * 100)}</span>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-surface-sunken">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${Math.round(row.share * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum font-medium text-ink">{value}</dd>
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-1 text-[20px] font-semibold text-ink">{value}</dd>
      <dd className="mt-0.5 text-[11px] text-ink-muted">{hint}</dd>
    </div>
  )
}
