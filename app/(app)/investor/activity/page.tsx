import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { format } from '@/lib/money'
import { accountFor } from '@/services/accounts/accounts'
import { entriesFor } from '@/services/accounts/ledger'
import { ordersFor } from '@/services/accounts/orders'
import { Alert, Badge, Card, CardBody, PageHeader } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { LedgerAmount, LedgerStatus } from '../ledger-cells'
import type { LedgerEntryType } from '@/types/accounts'

export const metadata: Metadata = { title: 'Activity' }
export const dynamic = 'force-dynamic'

/** The filters, and which ledger types each one covers. */
const FILTERS: { key: string; label: string; types?: LedgerEntryType[] }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'deposits', label: 'Deposits', types: ['deposit', 'transfer_in'] },
  { key: 'withdrawals', label: 'Withdrawals', types: ['withdrawal', 'transfer_out'] },
  { key: 'investments', label: 'Investments', types: ['investment_debit', 'investment_refund'] },
  { key: 'distributions', label: 'Distributions', types: ['distribution_credit'] },
  { key: 'fees', label: 'Fees and adjustments', types: ['fee', 'adjustment'] },
]

/**
 * Everything that has happened on the account, in one timeline.
 *
 * Grouped by day rather than listed flat: an investor scanning for "the day I
 * put money in" is looking for a date, and a thousand rows with a date column
 * makes them read every one.
 *
 * Orders that never became a ledger entry — rejected on eligibility, or
 * cancelled before confirmation — are shown alongside. An investor who tried
 * to invest and was stopped needs to see that attempt; a timeline that only
 * records what succeeded cannot explain why the money is still there.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const actor = await requireActor()
  if (!isAvailable('INVESTOR_PLATFORM_ENABLED')) redirect('/investments')

  const account = await accountFor(actor)
  if (!account) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Activity" />
        <Alert tone="neutral" title="No investment account yet">
          Complete your investor onboarding and your activity will appear here.
        </Alert>
      </div>
    )
  }

  const params = await searchParams
  const active = FILTERS.find((filter) => filter.key === params.filter) ?? FILTERS[0]!

  const [entries, orders] = await Promise.all([
    entriesFor(account.id),
    ordersFor(account.id),
  ])

  const visible = active.types
    ? entries.filter((entry) => active.types!.includes(entry.type))
    : entries

  // Attempts that produced no money movement, so they would otherwise vanish.
  const unresolved = active.key === 'all' || active.key === 'investments'
    ? orders.filter((order) => !order.ledger_entry_id && order.status !== 'draft')
    : []

  const days = new Map<string, { entries: typeof visible; orders: typeof unresolved }>()
  for (const entry of visible) {
    const day = entry.effective_at.slice(0, 10)
    const bucket = days.get(day) ?? { entries: [], orders: [] }
    bucket.entries.push(entry)
    days.set(day, bucket)
  }
  for (const order of unresolved) {
    const day = order.created_at.slice(0, 10)
    const bucket = days.get(day) ?? { entries: [], orders: [] }
    bucket.orders.push(order)
    days.set(day, bucket)
  }
  const ordered = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow={account.reference}
        title="Activity"
        description="Every movement on your account, and every attempt that did not become one."
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={filter.key === 'all' ? '/investor/activity' : `/investor/activity?filter=${filter.key}`}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] transition-colors',
              filter.key === active.key
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-ink-secondary hover:bg-surface-sunken',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {ordered.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-muted">Nothing here yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {ordered.map(([day, bucket]) => (
            <div key={day}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                {formatDate(day)}
              </p>
              <Card>
                <CardBody className="space-y-0 p-0">
                  {bucket.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] text-ink">{entry.description}</span>
                        <span className="mt-0.5 block"><LedgerStatus status={entry.status} /></span>
                      </span>
                      <LedgerAmount cents={entry.amount_cents} />
                    </div>
                  ))}
                  {bucket.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] text-ink">
                          Order {order.reference} — {format(order.amount_cents as never)}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
                          {order.rejection_reason ?? order.failure_reason ?? 'No money moved.'}
                        </span>
                      </span>
                      <Badge tone={order.status === 'rejected' ? 'critical' : 'neutral'}>
                        {order.status === 'rejected' ? 'Not eligible' : 'Cancelled'}
                      </Badge>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
