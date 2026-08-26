'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

type CountKey = 'issues' | 'matches' | 'indications' | 'messages' | 'documents' | 'offerings'

type Tab = {
  segment: string
  label: string
  count?: CountKey
}

type Group = {
  label: string
  /**
   * The number shown on the group itself. Only counts that represent something
   * waiting on the user roll up here — open issues, lender indications, unread
   * messages. Inventory counts (documents on file, live offerings, lenders
   * matched) stay on their own tab, so the top row reads as "what needs me"
   * rather than as a pile of mixed-unit totals.
   */
  attention?: CountKey
  tabs: Tab[]
}

/**
 * Two levels, because fifteen tabs in one row is fifteen decisions before any
 * work starts — and at 1440px the last three fell off the end of the strip
 * entirely. Six groups fit on any laptop; the detail is one click in, under the
 * heading a person would already have guessed.
 *
 * The first tab in each group is where the group lands.
 */
const GROUPS: Group[] = [
  { label: 'Overview', tabs: [{ segment: '', label: 'Overview' }] },
  {
    label: 'Financials',
    tabs: [
      { segment: 'financials', label: 'Financials' },
      { segment: 'operations', label: 'Operations' },
      { segment: 'transaction', label: 'Transaction' },
      { segment: 'sponsor', label: 'Sponsor' },
    ],
  },
  {
    label: 'Documents',
    attention: 'issues',
    tabs: [
      { segment: 'documents', label: 'Documents', count: 'documents' },
      { segment: 'issues', label: 'Issues', count: 'issues' },
    ],
  },
  {
    label: 'Analysis',
    tabs: [
      { segment: 'analysis', label: 'AI Analysis' },
      { segment: 'memo', label: 'Credit Memo' },
    ],
  },
  {
    // Debt and equity sit together: a sponsor thinking about the stack is
    // thinking about both halves of it, and separating them pushed equity off
    // the end of the strip where nobody found it.
    label: 'Capital',
    attention: 'indications',
    tabs: [
      { segment: 'capital', label: 'Capital stack' },
      { segment: 'equity', label: 'Equity', count: 'offerings' },
      { segment: 'matches', label: 'Lender matches', count: 'matches' },
      { segment: 'indications', label: 'Indications', count: 'indications' },
    ],
  },
  {
    label: 'Activity',
    attention: 'messages',
    tabs: [
      { segment: 'activity', label: 'Activity' },
      { segment: 'messages', label: 'Messages', count: 'messages' },
    ],
  },
]

export type DealTabCounts = Record<CountKey, number>

export function DealTabs({
  dealId, counts,
}: {
  dealId: string
  counts: DealTabCounts
}) {
  const pathname = usePathname()
  const base = `/deals/${dealId}`
  const href = (segment: string) => (segment ? `${base}/${segment}` : base)
  const isActive = (segment: string) => (segment ? pathname === href(segment) : pathname === base)

  const activeGroup = GROUPS.find((group) => group.tabs.some((tab) => isActive(tab.segment)))

  return (
    <div className="no-print">
      <nav className="flex gap-0.5 overflow-x-auto border-b border-line" aria-label="Deal sections">
        {GROUPS.map((group) => {
          const first = group.tabs[0]
          const active = group === activeGroup
          const attention = group.attention ? counts[group.attention] : 0
          return (
            <Link
              key={group.label}
              href={href(first.segment)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-[13px] transition-colors',
                active
                  ? 'border-accent font-medium text-accent'
                  : 'border-transparent text-ink-secondary hover:border-line-strong hover:text-ink',
              )}
            >
              {group.label}
              <CountBadge count={attention} tone={group.attention === 'issues' ? 'warning' : 'neutral'} />
            </Link>
          )
        })}
      </nav>

      {activeGroup && activeGroup.tabs.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto pt-2" aria-label={`${activeGroup.label} pages`}>
          {activeGroup.tabs.map((tab) => {
            const active = isActive(tab.segment)
            return (
              <Link
                key={tab.segment}
                href={href(tab.segment)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] transition-colors',
                  active
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {tab.label}
                <CountBadge count={tab.count ? counts[tab.count] : 0} tone={tab.count === 'issues' ? 'warning' : 'neutral'} />
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}

function CountBadge({ count, tone }: { count: number; tone: 'warning' | 'neutral' }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'tnum flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
        tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-muted',
      )}
    >
      {count}
    </span>
  )
}
