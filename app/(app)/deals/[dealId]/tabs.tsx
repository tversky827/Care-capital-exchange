'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

const TABS = [
  { segment: '', label: 'Overview' },
  { segment: 'financials', label: 'Financials' },
  { segment: 'operations', label: 'Operations' },
  { segment: 'transaction', label: 'Transaction' },
  { segment: 'sponsor', label: 'Sponsor' },
  { segment: 'documents', label: 'Documents', count: 'documents' as const },
  { segment: 'issues', label: 'Issues', count: 'issues' as const },
  { segment: 'analysis', label: 'AI Analysis' },
  { segment: 'memo', label: 'Credit Memo' },
  { segment: 'capital', label: 'Capital' },
  { segment: 'matches', label: 'Lender Matches', count: 'matches' as const },
  { segment: 'indications', label: 'Indications', count: 'indications' as const },
  { segment: 'equity', label: 'Equity', count: 'offerings' as const },
  { segment: 'messages', label: 'Messages', count: 'messages' as const },
  { segment: 'activity', label: 'Activity' },
]

export function DealTabs({
  dealId, counts,
}: {
  dealId: string
  counts: {
    issues: number; matches: number; indications: number; messages: number
    documents: number; offerings: number
  }
}) {
  const pathname = usePathname()
  const base = `/deals/${dealId}`

  return (
    <nav className="no-print flex gap-0.5 overflow-x-auto border-b border-line">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base
        const active = tab.segment ? pathname === href : pathname === base
        const count = tab.count ? counts[tab.count] : 0
        return (
          <Link
            key={tab.segment || 'overview'}
            href={href}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors',
              active
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-ink-secondary hover:border-line-strong hover:text-ink',
            )}
          >
            {tab.label}
            {count > 0 ? (
              <span
                className={cn(
                  'tnum flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-semibold rounded-full',
                  tab.count === 'issues' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-muted',
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
