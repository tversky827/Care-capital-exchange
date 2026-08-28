import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { ensureAccount } from '@/services/practice/accounts'
import { entriesFor } from '@/services/practice/ledger'
import { portfolioFor } from '@/services/practice/portfolio'
import { Alert, Card, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import { AddVirtualCash, RemoveVirtualCash, ResetSandbox } from './forms'

export const metadata: Metadata = { title: 'Virtual cash' }
export const dynamic = 'force-dynamic'

/**
 * Virtual cash, and every movement of it.
 *
 * The ledger is shown in full for the same reason the live one is: a balance
 * somebody cannot add up themselves is a balance they have to take on trust,
 * and the whole point of practising is to learn to check.
 */
export default async function SandboxCashPage() {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) redirect('/investor')
  const environment = await currentEnvironment(actor.user.id)
  if (environment === 'live') redirect('/sandbox')

  const account = await ensureAccount(actor, environment)
  const [entries, portfolio] = await Promise.all([
    entriesFor(account.id),
    portfolioFor(account.id),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title="Virtual cash"
        description="Money that does not exist, moving through a ledger that behaves exactly like the real one."
      />

      <Card>
        <dl className="data-grid grid-cols-2 lg:grid-cols-4">
          <Figure label="Virtual cash" value={format(portfolio.cashCents)} hint="available to deploy" emphasis />
          <Figure label="Invested" value={format(portfolio.investedCents)} hint="at cost, across every holding" />
          <Figure label="Simulated distributions" value={format(portfolio.distributionsCents)} hint="paid back in, all time" />
          <Figure label="Simulated sale proceeds" value={format(portfolio.exitProceedsCents)} hint="from holdings exited" />
        </dl>
      </Card>

      <Alert tone="neutral" title="None of this is money">
        Adding virtual cash contacts no bank and moves nothing. Investing it buys no security and
        creates no obligation. The sandbox has no connection to any payment system — not one that is
        switched off, but none that exists.
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <AddVirtualCash />
        <RemoveVirtualCash availableLabel={format(portfolio.cashCents)} />
      </div>

      <Section title="Every movement" description="Your virtual balance is the sum of these entries. Nothing else.">
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-muted">Nothing has moved yet.</p>
          ) : (
            <>
              <ul className="md:hidden">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink">{entry.description}</span>
                      <span className="block text-[11px] text-ink-muted">{formatDate(entry.effective_at)}</span>
                    </span>
                    <Amount cents={entry.amount_cents} />
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <thead>
                    <Tr><Th>Date</Th><Th>What</Th><Th numeric>Amount</Th></Tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <Tr key={entry.id}>
                        <Td className="whitespace-nowrap text-ink-muted">{formatDate(entry.effective_at)}</Td>
                        <Td className="text-ink">{entry.description}</Td>
                        <Td numeric><Amount cents={entry.amount_cents} /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </CardBody>
      </Section>

      <ResetSandbox holdings={portfolio.active} cashLabel={format(portfolio.cashCents)} />
    </div>
  )
}

function Amount({ cents: value }: { cents: number }) {
  const positive = value > 0
  return (
    <span className={`tnum whitespace-nowrap text-[13px] font-medium ${positive ? 'text-positive' : 'text-ink'}`}>
      {positive ? '+' : '−'}{format(cents(Math.abs(value)))}
    </span>
  )
}

function Figure({
  label, value, hint, emphasis,
}: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className={`tnum mt-1 font-semibold text-ink ${emphasis ? 'text-[22px]' : 'text-[17px]'}`}>{value}</dd>
      <dd className="mt-0.5 text-[11px] text-ink-muted">{hint}</dd>
    </div>
  )
}
