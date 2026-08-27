import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { FEE_SCHEDULE } from '@/services/billing'
import { Alert, Badge, Card, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { MetricTile } from '@/components/deal/common'
import { formatCurrency, formatDate, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Billing' }

export default async function AdminBillingPage() {
  await requireAdmin()
  const store = await db()

  const [events, companies] = await Promise.all([
    store.select('billing_events', { orderBy: { field: 'created_at', dir: 'desc' }, limit: 200 }),
    store.select('companies', {}),
  ])
  const companyName = new Map(companies.map((company) => [company.id, company.name]))

  const feeRevenue = events
    .filter((event) => event.kind === 'success_fee' || event.kind === 'transaction_fee')
    .reduce((sum, event) => sum + event.amount_usd, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Billing"
        description="Plans and fee rules are configuration rather than code; changing them does not require a schema or application change."
      />

      <Alert tone="neutral" title="No payment provider configured">
        Fees are recorded locally rather than charged. The provider interface is Stripe-shaped, so
        connecting one does not change any other part of the product.
      </Alert>

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-4">
          <MetricTile label="Fees earned" value={formatCurrency(feeRevenue, { decimals: 2 })} />
          <MetricTile label="Billing events" value={events.length} />
          <MetricTile label="Recurring revenue" value="None" detail="the platform charges on outcomes only" />
        </div>
      </Card>

      <Section title="Fee schedule" description="Charged only on capital that actually funds. Nothing is charged on a raise that does not close, and an investor is never charged.">
        <Table>
          <thead><tr><Th>Rule</Th><Th>Applies to</Th><Th numeric>Rate</Th><Th numeric>Cap</Th></tr></thead>
          <tbody>
            {FEE_SCHEDULE.map((fee) => (
              <Tr key={fee.key}>
                <Td className="font-medium text-ink">{fee.label}</Td>
                <Td className="text-ink-secondary">{titleize(fee.appliesTo)}</Td>
                <Td numeric>{(fee.basisPoints / 100).toFixed(2)}%</Td>
                <Td numeric>{fee.capUsd ? formatCurrency(fee.capUsd) : 'Uncapped'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {events.length > 0 ? (
        <Section title="Billing events">
          <Table>
            <thead><tr><Th>Date</Th><Th>Organisation</Th><Th>Description</Th><Th>Type</Th><Th numeric>Amount</Th></tr></thead>
            <tbody>
              {events.map((event) => (
                <Tr key={event.id}>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDate(event.created_at)}</Td>
                  <Td className="text-ink-secondary">{companyName.get(event.company_id) ?? 'Unknown'}</Td>
                  <Td className="text-[12px] text-ink-secondary">{event.description}</Td>
                  <Td><Badge tone="neutral">{titleize(event.kind)}</Badge></Td>
                  <Td numeric>{formatCurrency(event.amount_usd, { decimals: 2 })}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
