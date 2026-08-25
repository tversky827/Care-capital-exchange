import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { CapitalPosition, CapitalSource } from '@/types/equity'

/**
 * The capital stack, drawn.
 *
 * Senior debt at the bottom, common equity at the top — the order in which
 * each layer gets paid, which is the single most important thing an equity
 * investor needs to understand about where they stand.
 */

const POSITION_LABELS: Record<CapitalPosition, string> = {
  senior_debt: 'Senior debt',
  mezzanine: 'Mezzanine',
  preferred_equity: 'Preferred equity',
  common_equity: 'Common equity',
}

/** Drawn top to bottom in reverse payment priority: last paid sits highest. */
const STACK_ORDER: CapitalPosition[] = ['common_equity', 'preferred_equity', 'mezzanine', 'senior_debt']

const POSITION_TONE: Record<CapitalPosition, string> = {
  senior_debt: 'bg-[#1f4e79]',
  mezzanine: 'bg-[#3d6f9c]',
  preferred_equity: 'bg-[#6b9ac4]',
  common_equity: 'bg-[#a8c5dd]',
}

export function CapitalStackChart({
  sources, total, showEmpty = true,
}: {
  sources: CapitalSource[]
  total: number
  showEmpty?: boolean
}) {
  if (sources.length === 0) {
    return showEmpty ? (
      <p className="text-[13px] text-ink-muted">No capital structure has been set for this deal yet.</p>
    ) : null
  }

  const ordered = [...sources].sort(
    (a, b) => STACK_ORDER.indexOf(a.position) - STACK_ORDER.indexOf(b.position),
  )

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded border border-line">
        {ordered.map((source) => {
          const share = total > 0 ? source.amount / total : 0
          return (
            <div key={source.id} className="flex items-stretch border-b border-line last:border-b-0">
              <div
                className={`${POSITION_TONE[source.position]} shrink-0`}
                style={{ width: `${Math.max(4, share * 100)}%`, minHeight: '2.75rem' }}
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{source.label}</div>
                  <div className="text-[11px] text-ink-muted">
                    {POSITION_LABELS[source.position]}
                    {source.cost_pct !== null ? ` · ${formatPercent(source.cost_pct * 100)} cost` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-medium tabular-nums text-ink">
                    {formatCurrency(source.amount, { compact: true })}
                  </div>
                  <div className="text-[11px] tabular-nums text-ink-muted">{formatPercent(share * 100)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-2 text-[12px]">
        <span className="text-ink-muted">Total capitalisation</span>
        <span className="font-semibold tabular-nums text-ink">{formatCurrency(total)}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Layers are shown in order of payment priority. Senior debt is repaid first; common equity is
        repaid last and only from what remains.
      </p>
    </div>
  )
}
