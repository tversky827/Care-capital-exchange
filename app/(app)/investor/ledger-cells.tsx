import { Badge } from '@/components/ui/primitives'
import { cents, format } from '@/lib/money'
import type { LedgerEntryStatus } from '@/types/accounts'

/**
 * A signed amount, coloured by direction.
 *
 * Money in is green and carries a plus; money out is plain and carries a
 * minus. The sign is always shown rather than implied by colour alone, which
 * a colour-blind reader or a printed statement would lose.
 */
export function LedgerAmount({ cents: amount }: { cents: number }) {
  const positive = amount > 0
  return (
    <span className={`tnum font-medium ${positive ? 'text-positive' : 'text-ink'}`}>
      {positive ? '+' : '−'}{format(cents(Math.abs(amount)))}
    </span>
  )
}

/**
 * What a ledger entry's status means, in the reader's terms.
 *
 * A posted entry needs no badge — it is the ordinary case, and marking every
 * ordinary row makes the exceptional ones harder to spot.
 */
export function LedgerStatus({ status }: { status: LedgerEntryStatus }) {
  if (status === 'posted') return <span className="text-[12px] text-ink-muted">Completed</span>
  if (status === 'pending') return <Badge tone="progress">In progress</Badge>
  if (status === 'failed') return <Badge tone="critical">Failed</Badge>
  if (status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>
  return <Badge tone="warning">Reversed</Badge>
}
