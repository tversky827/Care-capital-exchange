import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { db } from '@/db'
import { cents, format } from '@/lib/money'
import { distributionsForInvestor } from '@/services/equity/distributions'
import {
  Alert, Badge, Card, CardBody, PageHeader, Section, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import type { DistributionEvent, InvestmentDistribution, Offering } from '@/types/equity'

export const metadata: Metadata = { title: 'Distributions' }
export const dynamic = 'force-dynamic'

/**
 * What the holdings have actually paid out.
 *
 * Kept apart from the portfolio because it answers a different question. The
 * portfolio asks what the holdings are worth — an estimate, and the sponsor's.
 * This asks what has been paid, which is a fact, and it is the figure an
 * investor in private real estate checks most often.
 *
 * Every payment is split into return of capital, preferred return and profit
 * share, because those three are taxed differently and an investor who is only
 * shown a total cannot tell what they have received. Nothing here is
 * annualised into a yield: a distribution history of two quarters extrapolated
 * to a rate is a number the record does not support.
 */
export default async function DistributionsPage() {
  const actor = await requireActor()
  if (!isAvailable('INVESTOR_PLATFORM_ENABLED')) redirect('/investments')
  if (!actor.investor) redirect('/investor/onboarding')

  const store = await db()
  const paid = (await distributionsForInvestor(actor.investor.id))
    .filter((row) => row.status === 'processed')

  // The offerings, and the events these payments came out of. An investor is
  // shown an upcoming payment only for an offering they actually hold.
  const offeringIds = [...new Set(paid.map((row) => row.offering_id))]
  const positions = await store.select('investment_positions', {
    where: { investor_id: actor.investor.id },
  })
  const heldIds = [...new Set(positions.map((row) => row.offering_id))]

  const offerings = new Map<string, Offering>()
  for (const id of [...new Set([...offeringIds, ...heldIds])]) {
    const offering = await store.findById('offerings', id)
    if (offering) offerings.set(id, offering)
  }

  const events = new Map<string, DistributionEvent>()
  for (const id of [...new Set(paid.map((row) => row.distribution_event_id))]) {
    const event = await store.findById('distribution_events', id)
    if (event) events.set(id, event)
  }

  const upcoming: DistributionEvent[] = []
  for (const id of heldIds) {
    const scheduled = await store.select('distribution_events', { where: { offering_id: id } })
    upcoming.push(...scheduled.filter((event) => event.status !== 'processed' && event.status !== 'failed'))
  }
  upcoming.sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''))

  const total = sum(paid, (row) => row.amount)
  const capital = sum(paid, (row) => row.return_of_capital)
  const preferred = sum(paid, (row) => row.preferred_return)
  const profit = sum(paid, (row) => row.profit_share)

  // Grouped by the period the sponsor declared, not by the day it landed: an
  // investor holding four offerings gets four payments for one quarter and
  // thinks of them as that quarter's income.
  const periods = new Map<string, InvestmentDistribution[]>()
  for (const row of paid) {
    const label = events.get(row.distribution_event_id)?.period_label ?? 'Unlabelled'
    periods.set(label, [...(periods.get(label) ?? []), row])
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Distributions"
        description="What your holdings have paid you. These are amounts that actually moved, not estimates."
      />

      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure label="Paid to you, all time" value={format(cents(Math.round(total * 100)))} hint={`${paid.length} payment${paid.length === 1 ? '' : 's'}`} emphasis />
          <Figure label="Return of capital" value={format(cents(Math.round(capital * 100)))} hint="your own money back" />
          <Figure label="Preferred return" value={format(cents(Math.round(preferred * 100)))} hint="the stated rate on your capital" />
          <Figure label="Profit share" value={format(cents(Math.round(profit * 100)))} hint="your share above the preferred" />
        </dl>
      </Card>

      <Alert tone="neutral">
        Distributions are paid at the sponsor&rsquo;s discretion out of what the property actually
        earns. They are not interest, they are not scheduled payments, and a distribution having
        been paid once does not mean another will be. The split above is how the sponsor has
        characterised each payment; it is not tax advice, and your own return may treat it
        differently.
      </Alert>

      {upcoming.length > 0 ? (
        <Section title="Declared and not yet paid" description="What the sponsors of your holdings have announced.">
          <CardBody className="p-0">
            <Table minWidth="min-w-[40rem]">
              <thead>
                <Tr>
                  <Th>Investment</Th>
                  <Th>Period</Th>
                  <Th>Expected</Th>
                  <Th>Status</Th>
                  <Th numeric>To the whole class</Th>
                </Tr>
              </thead>
              <tbody>
                {upcoming.map((event) => (
                  <Tr key={event.id}>
                    <Td className="text-ink">{offerings.get(event.offering_id)?.name ?? 'An investment'}</Td>
                    <Td className="text-ink-secondary">{event.period_label}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {event.scheduled_for ? formatDate(event.scheduled_for) : 'Not dated'}
                    </Td>
                    <Td><Badge tone="neutral">{event.status}</Badge></Td>
                    <Td numeric className="text-ink-secondary">
                      {format(cents(Math.round(event.total_amount * 100)))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              The final column is the amount going to every holder of the class, not to you. Your
              share is calculated when the sponsor processes the payment.
            </p>
          </CardBody>
        </Section>
      ) : null}

      <Section
        title="Every payment"
        description="Each one lands in your cash account and is available to invest again."
      >
        <CardBody className="p-0">
          {paid.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-muted">
              Nothing has been paid out yet. Distributions appear here once a sponsor processes one.
            </p>
          ) : (
            <>
              {/* The amount paid is the column that matters, and on a phone a
                  six-column table puts it past the right-hand edge. Below the
                  breakpoint each payment becomes a row with its split beneath. */}
              <ul className="md:hidden">
                {paid.map((row) => (
                  <li key={row.id} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13px] text-ink">
                          {offerings.get(row.offering_id)?.name ?? 'An investment'}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          {events.get(row.distribution_event_id)?.period_label ?? '—'}
                          {' · '}
                          {row.processed_at ? formatDate(row.processed_at) : formatDate(row.created_at)}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                        {format(cents(Math.round(row.amount * 100)))}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {format(cents(Math.round(row.return_of_capital * 100)))} capital ·{' '}
                      {format(cents(Math.round(row.preferred_return * 100)))} preferred ·{' '}
                      {format(cents(Math.round(row.profit_share * 100)))} profit
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
              <thead>
                <Tr>
                  <Th>Investment</Th>
                  <Th>Period</Th>
                  <Th numeric>Return of capital</Th>
                  <Th numeric>Preferred</Th>
                  <Th numeric>Profit share</Th>
                  <Th numeric>Paid</Th>
                </Tr>
              </thead>
              <tbody>
                {paid.map((row) => {
                  const offering = offerings.get(row.offering_id)
                  return (
                    <Tr key={row.id}>
                      <Td>
                        {offering ? (
                          <Link href={`/investments/${offering.id}`} className="text-accent hover:underline">
                            {offering.name}
                          </Link>
                        ) : (
                          <span className="text-ink">An investment</span>
                        )}
                        <span className="block text-[11px] text-ink-muted">
                          {row.processed_at ? formatDate(row.processed_at) : formatDate(row.created_at)}
                        </span>
                      </Td>
                      <Td className="text-ink-secondary">
                        {events.get(row.distribution_event_id)?.period_label ?? '—'}
                      </Td>
                      <Td numeric className="text-ink-muted">{format(cents(Math.round(row.return_of_capital * 100)))}</Td>
                      <Td numeric className="text-ink-muted">{format(cents(Math.round(row.preferred_return * 100)))}</Td>
                      <Td numeric className="text-ink-muted">{format(cents(Math.round(row.profit_share * 100)))}</Td>
                      <Td numeric className="font-semibold text-ink">{format(cents(Math.round(row.amount * 100)))}</Td>
                    </Tr>
                  )
                })}
              </tbody>
                </Table>
              </div>
            </>
          )}
        </CardBody>
      </Section>

      {periods.size > 1 ? (
        <Section title="By period" description="The same payments, grouped as the sponsors declared them.">
          <CardBody className="space-y-2">
            {[...periods.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([label, rows]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0">
                  <span className="text-[13px] text-ink">{label}</span>
                  <span className="text-[11px] text-ink-muted">
                    {rows.length} payment{rows.length === 1 ? '' : 's'}
                  </span>
                  <span className="tnum text-[13px] font-semibold text-ink">
                    {format(cents(Math.round(sum(rows, (row) => row.amount) * 100)))}
                  </span>
                </div>
              ))}
          </CardBody>
        </Section>
      ) : null}
    </div>
  )
}

function sum<T>(rows: T[], of: (row: T) => number): number {
  return rows.reduce((total, row) => total + of(row), 0)
}

function Figure({
  label, value, hint, emphasis,
}: {
  label: string
  value: string
  hint: string
  emphasis?: boolean
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className={`tnum mt-1 font-semibold text-ink ${emphasis ? 'text-[22px]' : 'text-[17px]'}`}>
        {value}
      </dd>
      <dd className="mt-0.5 text-[11px] text-ink-muted">{hint}</dd>
    </div>
  )
}
