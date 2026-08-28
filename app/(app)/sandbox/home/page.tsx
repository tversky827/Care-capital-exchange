import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format, formatWhole } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { ensureAccount, activityFor } from '@/services/practice/accounts'
import { portfolioFor, diversification } from '@/services/practice/portfolio'
import { searchOfferings } from '@/services/equity/matching'
import { OfferingCard } from '@/components/equity/offering-card'
import { Alert, Button, Card, CardBody, PageHeader, Section } from '@/components/ui/primitives'
import { formatDate, formatPercent } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Sandbox' }
export const dynamic = 'force-dynamic'

/**
 * Home, inside the sandbox.
 *
 * Deliberately the same shape as the live investor home — the same four
 * figures in the same order, the same holdings list, the same activity feed.
 * A sandbox that arranges itself differently teaches its own layout rather
 * than the product's.
 *
 * What it adds is the one thing the live home has no reason to: how spread the
 * portfolio is, and against what rule. That is the question the exercise
 * exists to make somebody ask.
 */
export default async function SandboxHomePage() {
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

  const held = new Set(portfolio.holdings.map((row) => row.position.offering_id))
  const open = actor.investor
    ? (await searchOfferings(actor.investor.id, { status: 'live' }))
      .filter((row) => !held.has(row.offering.id))
      .slice(0, 3)
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title={environment === 'demo' ? 'Demonstration' : 'Practice investing'}
        description={
          environment === 'demo'
            ? 'A fictional world, for showing what the product does.'
            : 'Real opportunities, virtual money. Nothing here creates an investment or an obligation.'
        }
      />

      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure label="Account value" value={format(portfolio.accountValueCents)} hint="virtual cash plus holdings at cost" />
          <Figure label="Virtual cash" value={format(portfolio.cashCents)} hint="available to deploy" />
          <Figure label="Invested" value={format(portfolio.investedCents)} hint={`${portfolio.active} holding${portfolio.active === 1 ? '' : 's'}`} />
          <Figure
            label="Paid out"
            value={format(cents(portfolio.distributionsCents + portfolio.exitProceedsCents))}
            hint="simulated, all time"
          />
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Link href="/investments"><Button size="sm" variant="primary">Browse opportunities</Button></Link>
          <Link href="/sandbox/cash"><Button size="sm">Virtual cash</Button></Link>
          <Link href="/sandbox/portfolio"><Button size="sm">My practice portfolio</Button></Link>
        </div>
      </Card>

      {portfolio.hypotheticalMultiple !== null ? (
        <Alert tone="neutral" title="These figures are hypothetical">
          {portfolio.hypotheticalMultiple}× back on every virtual dollar so far
          {portfolio.hypotheticalIrrPct !== null
            ? `, ${formatPercent(portfolio.hypotheticalIrrPct)} a year across the quarters simulated`
            : ''}
          . Simulated from the assumptions each sponsor has stated, not from anything that happened.
          Holdings are carried at what was paid for them and never marked up. This is not actual
          performance and does not predict any.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Section
            title="Open to invest in"
            description="The same raises the live marketplace shows, at the access level you already have."
            actions={<Link href="/investments" className="text-[12px] text-accent hover:underline">See all</Link>}
          >
            <CardBody>
              {open.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Nothing open that you are not already in.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {open.map((row) => (
                    <OfferingCard
                      key={row.offering.id}
                      offering={row.offering}
                      terms={row.terms}
                      deal={row.deal}
                      facility={row.facility}
                      match={row.match}
                      revealIdentity={false}
                      committedPct={
                        row.offering.target_raise && row.offering.target_raise > 0
                          ? row.offering.committed_amount / row.offering.target_raise
                          : null
                      }
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Section>

          {portfolio.holdings.length > 0 ? (
            <Section
              title="Your practice holdings"
              actions={<Link href="/sandbox/portfolio" className="text-[12px] text-accent hover:underline">Full portfolio</Link>}
            >
              <CardBody className="space-y-2">
                {portfolio.holdings.slice(0, 4).map(({ position, offering, returnedCents }) => (
                  <Link
                    key={position.id}
                    href={`/investments/${position.offering_id}`}
                    className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2.5 hover:border-line-strong"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {offering?.name ?? 'An investment'}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        {formatWhole(cents(position.invested_cents))} invested
                        {returnedCents > 0 ? ` · ${formatWhole(returnedCents)} simulated back` : ''}
                        {position.status === 'exited' ? ' · exited' : ''}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                ))}
              </CardBody>
            </Section>
          ) : null}
        </div>

        <div className="space-y-5">
          <Section
            title="How spread it is"
            description="An educational check, not a judgement about whether the portfolio is a good one."
          >
            <CardBody className="space-y-2.5">
              {spread.rules.map((rule) => (
                <div key={rule.key} className="flex items-start gap-2">
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${rule.met ? 'bg-positive' : 'bg-line-strong'}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-ink">{rule.label}</span>
                    <span className="block text-[11px] text-ink-muted">{rule.detail}</span>
                  </span>
                </div>
              ))}
              <p className="border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
                A concentrated portfolio can be the better decision. This measures whether one is
                spread, and nothing more.
              </p>
            </CardBody>
          </Section>

          <Section
            title="What you have done"
            actions={<Link href="/sandbox/portfolio" className="text-[12px] text-accent hover:underline">All of it</Link>}
          >
            <CardBody className="space-y-2.5">
              {activity.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Nothing yet.</p>
              ) : (
                activity.slice(0, 8).map((event) => (
                  <div key={event.id} className="border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                    <p className="text-[12px] leading-relaxed text-ink">{event.summary}</p>
                    <p className="text-[11px] text-ink-muted">{formatDate(event.created_at)}</p>
                  </div>
                ))
              )}
            </CardBody>
          </Section>
        </div>
      </div>
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
