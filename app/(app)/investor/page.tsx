import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { db } from '@/db'
import { cents, format, formatWhole } from '@/lib/money'
import { accountFor } from '@/services/accounts/accounts'
import { balanceFor, entriesFor, spendableFor } from '@/services/accounts/ledger'
import { portfolioFor } from '@/services/equity/portfolio'
import { searchOfferings } from '@/services/equity/matching'
import { CURRENT_NDA } from '@/lib/equity/nda'
import { OfferingCard } from '@/components/equity/offering-card'
import { Alert, Button, Card, CardBody, PageHeader, Section } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import { LedgerAmount } from './ledger-cells'

export const metadata: Metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'

/**
 * The investor's home.
 *
 * A brokerage home screen answers three questions before anything else: what
 * am I worth, what can I spend, and what should I look at. Everything below
 * that is secondary and is ordered accordingly.
 *
 * There is no performance chart. A portfolio of private positions held at cost
 * until a sponsor reports a value would produce a flat line with a step in it,
 * which says nothing true and implies a precision that does not exist.
 */
export default async function InvestorHomePage() {
  const actor = await requireActor()
  if (!isAvailable('INVESTOR_PLATFORM_ENABLED')) redirect('/investments')
  if (!actor.investor) redirect('/investor/onboarding')

  const account = await accountFor(actor)
  if (!account) redirect('/investor/onboarding')

  const store = await db()
  const [balance, spendable, entries, portfolio] = await Promise.all([
    balanceFor(account.id),
    spendableFor(account.id),
    entriesFor(account.id),
    portfolioFor(actor),
  ])

  // Offerings this investor has already signed for keep their real names; the
  // rest stay anonymised, exactly as on the marketplace.
  const signed = new Set(
    (await store.select('nda_acceptances', {
      where: { company_id: actor.company.id, nda_version: CURRENT_NDA.version },
    })).map((row) => row.offering_id),
  )

  const held = new Set(portfolio.positions.map((row) => row.position.offering_id))
  const opportunities = (await searchOfferings(actor.investor.id, { status: 'live' }))
    .filter((row) => !held.has(row.offering.id))
    .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))
    .slice(0, 3)

  const invested = cents(Math.round(portfolio.capitalInvested * 100))
  const value = cents(Math.round(portfolio.estimatedValue * 100))
  const distributions = cents(Math.round(portfolio.distributionsReceived * 100))
  const portfolioValue = cents(value + balance.available_cents)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title={`${greeting()}, ${actor.user.full_name.split(' ')[0]}`}
        description="Your account, your holdings, and what is open to invest in."
      />

      {/* ---- the four figures ------------------------------------------- */}
      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure label="Account value" value={format(portfolioValue)} hint="holdings at cost plus cash" />
          <Figure label="Available to invest" value={format(spendable)} hint="settled and uncommitted" />
          <Figure label="Invested" value={format(invested)} hint={`${portfolio.positions.length} holding${portfolio.positions.length === 1 ? '' : 's'}`} />
          <Figure label="Distributions received" value={format(distributions)} hint="paid to you, all time" />
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Link href="/investor/cash"><Button size="sm" variant="primary">Add funds</Button></Link>
          <Link href="/investments"><Button size="sm">Browse investments</Button></Link>
          <Link href="/investor/portfolio"><Button size="sm">My portfolio</Button></Link>
        </div>
      </Card>

      {spendable > 0 && portfolio.positions.length === 0 ? (
        <Alert tone="neutral" title={`${format(spendable)} is sitting in cash`}>
          It earns nothing while it waits. Have a look at what is open.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---- what is open ---------------------------------------------- */}
        <div className="space-y-5">
          <Section
            title={actor.investor ? 'Matching what you look for' : 'Open to investors'}
            description="Ranked against the preferences you set, never by size of raise and never by who is paying."
            actions={
              <Link href="/investments" className="text-[12px] text-accent hover:underline">
                See all
              </Link>
            }
          >
            <CardBody className="space-y-3">
              {opportunities.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  Nothing open that you are not already in.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {opportunities.map((row) => (
                    <OfferingCard
                      key={row.offering.id}
                      offering={row.offering}
                      terms={row.terms}
                      deal={row.deal}
                      facility={row.facility}
                      match={row.match}
                      revealIdentity={signed.has(row.offering.id)}
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

          {/* ---- holdings ------------------------------------------------- */}
          {portfolio.positions.length > 0 ? (
            <Section
              title="Your holdings"
              actions={
                <Link href="/investor/portfolio" className="text-[12px] text-accent hover:underline">
                  Full portfolio
                </Link>
              }
            >
              <CardBody className="space-y-2">
                {portfolio.positions.slice(0, 4).map(({ position, offering }) => (
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
                        {formatWhole(cents(Math.round(position.invested_amount * 100)))} invested
                        {position.distributions_received > 0
                          ? ` · ${formatWhole(cents(Math.round(position.distributions_received * 100)))} paid out`
                          : ''}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                ))}
              </CardBody>
            </Section>
          ) : null}
        </div>

        {/* ---- recent activity -------------------------------------------- */}
        <Section
          title="Recent activity"
          actions={
            <Link href="/investor/activity" className="text-[12px] text-accent hover:underline">
              All activity
            </Link>
          }
        >
          <CardBody className="space-y-2.5">
            {entries.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Nothing has happened yet.</p>
            ) : (
              entries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink">{entry.description}</span>
                    <span className="block text-[11px] text-ink-muted">{formatDate(entry.effective_at)}</span>
                  </span>
                  <LedgerAmount cents={entry.amount_cents} />
                </div>
              ))
            )}
          </CardBody>
        </Section>
      </div>
    </div>
  )
}

/** Time of day on the server, which is close enough for a greeting. */
function greeting(): string {
  const hour = new Date().getUTCHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
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
