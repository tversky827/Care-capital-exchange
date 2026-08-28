import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format } from '@/lib/money'
import { accountFor } from '@/services/accounts/accounts'
import { balanceFor, entriesFor, spendableFor } from '@/services/accounts/ledger'
import { isDemoMode } from '@/services/accounts/providers'
import { Alert, Card, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import { AddFunds, Withdraw } from './forms'
import { LedgerAmount, LedgerStatus } from '../ledger-cells'

export const metadata: Metadata = { title: 'Cash' }
export const dynamic = 'force-dynamic'

/**
 * The cash account.
 *
 * Four figures, and the difference between them is the whole point: what has
 * settled, what is on its way in, what is already spoken for, and what can
 * actually be invested right now. An investor who sees one number cannot tell
 * why an order was refused.
 *
 * Below them is every movement, in full. There is no summarised or truncated
 * view of the ledger anywhere in the product — a statement a person cannot
 * reconcile against their own arithmetic is not a statement.
 */
export default async function CashPage() {
  const actor = await requireActor()
  if (!isAvailable('CASH_ACCOUNT_ENABLED')) redirect('/investments')

  const account = await accountFor(actor)
  if (!account) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Cash" description="Fund your account once, then deploy it across investments." />
        <Alert tone="neutral" title="No investment account yet">
          Complete your investor onboarding and an account will be opened for you.
        </Alert>
      </div>
    )
  }

  const [balance, spendable, entries] = await Promise.all([
    balanceFor(account.id),
    spendableFor(account.id),
    entriesFor(account.id),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title="Cash"
        description="Fund your account once, then deploy it across as many investments as you like."
      />

      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Available to invest"
            value={format(spendable)}
            hint="settled, and not committed elsewhere"
            emphasis
          />
          <Figure
            label="Settled"
            value={format(cents(balance.available_cents))}
            hint="cleared into your account"
          />
          <Figure
            label="Clearing"
            value={format(cents(balance.pending_incoming_cents))}
            hint="on its way in, not yet investable"
          />
          <Figure
            label="Committed"
            value={format(cents(balance.pending_outgoing_cents))}
            hint="held for investments that have not settled"
          />
        </dl>
      </Card>

      {isDemoMode() ? (
        <Alert tone="warning" title="Demonstration mode">
          No real money moves through this environment. Adding funds records a balance here and
          contacts no bank; investing records a position and buys no security.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AddFunds demo={isDemoMode()} />
        <Withdraw availableLabel={format(spendable)} />
      </div>

      <Section
        title="Every movement"
        description="Your balance is the sum of these entries. Nothing else."
      >
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-muted">Nothing has moved yet.</p>
          ) : (
            <>
              {/* On a phone the amount is the column that matters, and a
                  four-column table puts it off the right-hand edge. Below the
                  breakpoint each entry becomes a row of its own instead. */}
              <ul className="md:hidden">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink">{entry.description}</span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="text-[11px] text-ink-muted">{formatDate(entry.effective_at)}</span>
                        <LedgerStatus status={entry.status} />
                      </span>
                    </span>
                    <LedgerAmount cents={entry.amount_cents} />
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <thead>
                    <Tr>
                      <Th>Date</Th>
                      <Th>What</Th>
                      <Th>Status</Th>
                      <Th numeric>Amount</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <Tr key={entry.id}>
                        <Td className="whitespace-nowrap text-ink-muted">{formatDate(entry.effective_at)}</Td>
                        <Td className="text-ink">{entry.description}</Td>
                        <Td><LedgerStatus status={entry.status} /></Td>
                        <Td numeric><LedgerAmount cents={entry.amount_cents} /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </CardBody>
      </Section>
    </div>
  )
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
