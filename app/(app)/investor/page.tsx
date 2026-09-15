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
import { OfferingRow } from '@/components/equity/offering-row'
import { Button, Card } from '@/components/ui/primitives'
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

  const value = cents(Math.round(portfolio.estimatedValue * 100))
  const distributions = cents(Math.round(portfolio.distributionsReceived * 100))
  const portfolioValue = cents(value + balance.available_cents)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ---- one number ---------------------------------------------------
          Everything else is a sentence underneath it. The grid of four this
          replaced put "account value" beside "available to invest" beside
          "invested" beside "distributions", each with a caption — four numbers
          and four captions to read before knowing whether anything needed
          attention. */}
      <div>
        <p className="text-[12px] text-ink-muted">{account.reference}</p>
        <p className="tnum mt-1 text-[42px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[52px]">
          {format(portfolioValue)}
        </p>
        <p className="mt-2 text-[13px] text-ink-secondary">
          {portfolio.positions.length === 0
            ? `${format(spendable)} ready to invest`
            : [
              `${format(spendable)} to invest`,
              `${portfolio.positions.length} investment${portfolio.positions.length === 1 ? '' : 's'}`,
              distributions > 0 ? `${format(distributions)} paid out` : null,
            ].filter(Boolean).join('  ·  ')}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/investments"><Button variant="primary">Find an investment</Button></Link>
          <Link href="/investor/cash"><Button>Add cash</Button></Link>
        </div>
      </div>

      {/* ---- what you own -------------------------------------------------- */}
      {portfolio.positions.length > 0 ? (
        <div>
          <Label>Your investments</Label>
          <Card className="overflow-hidden">
            {portfolio.positions.slice(0, 5).map(({ position, offering }) => (
              <Link
                key={position.id}
                href={`/investments/${position.offering_id}`}
                className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {offering?.name ?? 'An investment'}
                  </span>
                  {position.distributions_received > 0 ? (
                    <span className="block text-[12px] text-ink-muted">
                      {formatWhole(cents(Math.round(position.distributions_received * 100)))} paid out
                    </span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-[14px] font-medium text-ink">
                  {formatWhole(cents(Math.round(position.invested_amount * 100)))}
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-muted" />
              </Link>
            ))}
          </Card>
          <Link href="/investor/portfolio" className="mt-2 inline-block text-[12px] text-accent hover:underline">
            Full portfolio
          </Link>
        </div>
      ) : null}

      {/* ---- what is open --------------------------------------------------- */}
      {opportunities.length > 0 ? (
        <div>
          <Label>Open now</Label>
          <Card className="overflow-hidden">
            {opportunities.map((row) => (
              <OfferingRow
                key={row.offering.id}
                offering={row.offering}
                terms={row.terms}
                deal={row.deal}
                facility={row.facility}
                revealIdentity={signed.has(row.offering.id)}
              />
            ))}
          </Card>
          <Link href="/investments" className="mt-2 inline-block text-[12px] text-accent hover:underline">
            See all
          </Link>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div>
          <Label>Recent</Label>
          <Card className="overflow-hidden">
            {entries.slice(0, 4).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{entry.description}</span>
                  <span className="block text-[11px] text-ink-muted">{formatDate(entry.effective_at)}</span>
                </span>
                <LedgerAmount cents={entry.amount_cents} />
              </div>
            ))}
          </Card>
          <Link href="/investor/activity" className="mt-2 inline-block text-[12px] text-accent hover:underline">
            All activity
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
      {children}
    </p>
  )
}
