import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format, formatWhole } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { isGuest } from '@/services/auth'
import { catalogueFor } from '@/lib/catalogue'
import { ensureAccount } from '@/services/practice/accounts'
import { portfolioFor } from '@/services/practice/portfolio'
import { searchOfferings } from '@/services/equity/matching'
import { OfferingRow } from '@/components/equity/offering-row'
import { Button, Card } from '@/components/ui/primitives'
import { Graduate } from '../graduate'

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
  const portfolio = await portfolioFor(account.id)

  const held = new Set(portfolio.holdings.map((row) => row.position.offering_id))
  const open = actor.investor
    ? (await searchOfferings(actor.investor.id, { status: 'live' }, catalogueFor(environment)))
      .filter((row) => !held.has(row.offering.id))
      .slice(0, 3)
    : []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ---- one number --------------------------------------------------
          The four-stat grid this replaced showed the same figure twice and
          two zeroes whenever nothing was owned, which is every first visit —
          the moment the screen most needs to be legible. */}
      <div>
        <p className="text-[12px] text-ink-muted">
          {environment === 'demo' ? 'Demonstration account' : 'Practice account'}
        </p>
        <p className="tnum mt-1 text-[42px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[52px]">
          {format(portfolio.accountValueCents)}
        </p>
        <p className="mt-2 text-[13px] text-ink-secondary">
          {portfolio.holdings.length === 0
            ? 'Virtual money, yours to invest. Nothing here is real and nothing can move.'
            : [
              `${format(portfolio.cashCents)} to invest`,
              `${portfolio.active} investment${portfolio.active === 1 ? '' : 's'}`,
              portfolio.distributionsCents + portfolio.exitProceedsCents > 0
                ? `${format(cents(portfolio.distributionsCents + portfolio.exitProceedsCents))} paid out`
                : null,
            ].filter(Boolean).join('  ·  ')}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/investments"><Button variant="primary">Find an investment</Button></Link>
          <Link href="/sandbox/cash"><Button>Add cash</Button></Link>
        </div>
      </div>

      {/* ---- what you own ------------------------------------------------- */}
      {portfolio.holdings.length > 0 ? (
        <div>
          <SectionLabel>Your investments</SectionLabel>
          <Card className="overflow-hidden">
            {portfolio.holdings.slice(0, 5).map(({ position, offering, returnedCents }) => (
              <Link
                key={position.id}
                href={`/investments/${position.offering_id}`}
                className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {offering?.name ?? 'An investment'}
                  </span>
                  <span className="block text-[12px] text-ink-muted">
                    {position.status === 'exited' ? 'Exited' : 'Held'}
                    {returnedCents > 0 ? ` · ${formatWhole(returnedCents)} back so far` : ''}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[14px] font-medium text-ink">
                  {formatWhole(cents(position.invested_cents))}
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-muted" />
              </Link>
            ))}
          </Card>
          <Link href="/sandbox/portfolio" className="mt-2 inline-block text-[12px] text-accent hover:underline">
            Full portfolio
          </Link>
        </div>
      ) : null}

      {/* ---- what is open -------------------------------------------------- */}
      {open.length > 0 ? (
        <div>
          <SectionLabel>Open now</SectionLabel>
          <Card className="overflow-hidden">
            {open.map((row) => (
              <OfferingRow
                key={row.offering.id}
                offering={row.offering}
                terms={row.terms}
                deal={row.deal}
                facility={row.facility}
              />
            ))}
          </Card>
          <Link href="/investments" className="mt-2 inline-block text-[12px] text-accent hover:underline">
            See all
          </Link>
        </div>
      ) : null}

      {isGuest(actor) ? (
        <p className="border-t border-line pt-4 text-[12px] leading-relaxed text-ink-muted">
          This is a guest session and will not be here tomorrow.{' '}
          <Link href="/signup?intent=invest" className="text-accent underline underline-offset-2">
            Create an account
          </Link>{' '}
          to practise against the real opportunities.
        </p>
      ) : (
        <Graduate holdings={portfolio.holdings.length} />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
      {children}
    </p>
  )
}
