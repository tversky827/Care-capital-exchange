import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Info } from 'lucide-react'
import { Badge, Button, Card, type Tone } from '@/components/ui/primitives'
import { STATUS_TONE, statusLabel } from '@/lib/deal/display'
import { formatPercent } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { DealStatus, DiscrepancySeverity } from '@/types'

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return <Badge tone={STATUS_TONE[status] as Tone}>{statusLabel(status)}</Badge>
}

export const SEVERITY_TONE: Record<DiscrepancySeverity, Tone> = {
  critical: 'critical',
  high: 'critical',
  medium: 'warning',
  low: 'neutral',
  info: 'neutral',
}

export function SeverityBadge({ severity }: { severity: DiscrepancySeverity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity}</Badge>
}

/**
 * The "what do I do next" card.
 *
 * Every primary screen in the product renders one of these. It is the answer to
 * the single question a user has when a page loads, and it is deliberately the
 * first thing below the page header.
 */
export function NextAction({
  tone = 'accent', headline, detail, action, secondary, items,
}: {
  tone?: Tone
  headline: string
  detail?: React.ReactNode
  action?: { href: string; label: string }
  secondary?: { href: string; label: string }
  items?: { label: string; href?: string | null }[]
}) {
  const icons: Partial<Record<Tone, React.ReactNode>> = {
    accent: <Info className="size-4" />,
    positive: <CheckCircle2 className="size-4" />,
    warning: <AlertTriangle className="size-4" />,
    critical: <AlertTriangle className="size-4" />,
    neutral: <CircleDashed className="size-4" />,
  }
  const styles: Record<string, string> = {
    accent: 'border-accent-line bg-accent-soft text-accent',
    positive: 'border-positive/20 bg-positive-soft text-positive',
    warning: 'border-warning/25 bg-warning-soft text-warning',
    critical: 'border-critical/25 bg-critical-soft text-critical',
    neutral: 'border-line bg-surface-sunken text-ink-secondary',
    progress: 'border-accent-line bg-accent-soft text-accent',
    closed: 'border-line bg-surface-sunken text-ink-muted',
  }

  return (
    <div className={cn('flex flex-wrap items-start gap-3 border p-4', styles[tone])}>
      <div className="mt-0.5 shrink-0">{icons[tone] ?? icons.accent}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{headline}</p>
        {detail ? <div className="mt-1 text-[12px] leading-relaxed opacity-90">{detail}</div> : null}
        {items?.length ? (
          <ul className="mt-2 space-y-1">
            {items.slice(0, 5).map((item) => (
              <li key={item.label} className="text-[12px] leading-relaxed opacity-90">
                ·{' '}
                {item.href ? (
                  <Link href={item.href} className="underline underline-offset-2 hover:no-underline">
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {action || secondary ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {secondary ? (
            <Link href={secondary.href}><Button size="sm">{secondary.label}</Button></Link>
          ) : null}
          {action ? (
            <Link href={action.href}>
              <Button variant="primary" size="sm" className="gap-1.5">
                {action.label} <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** A metric with its underlying formula surfaced, not hidden. */
export function MetricTile({
  label, value, detail, tone, formula, className,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: 'positive' | 'warning' | 'critical'
  formula?: string
  className?: string
}) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <p className="text-[11px] uppercase tracking-[0.04em] text-ink-muted" title={formula}>
        {label}
      </p>
      <p
        className={cn('tnum mt-1 text-[18px] font-semibold leading-none', {
          'text-positive': tone === 'positive',
          'text-warning': tone === 'warning',
          'text-critical': tone === 'critical',
          'text-ink': !tone,
        })}
      >
        {value}
      </p>
      {detail ? <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{detail}</p> : null}
    </div>
  )
}

/** Confidence pill used wherever an extracted value is displayed. */
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null
  const tone: Tone = confidence >= 0.9 ? 'positive' : confidence >= 0.7 ? 'warning' : 'critical'
  const label = confidence >= 0.9 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Low'
  return (
    <Badge tone={tone} title={`Extraction confidence ${formatPercent(confidence * 100, 0)}`}>
      {label}
    </Badge>
  )
}

export function ReadinessBar({
  score, canDistribute, blockingReason, href,
}: {
  score: number
  canDistribute: boolean
  blockingReason: string | null
  href: string
}) {
  const tone = canDistribute ? 'positive' : score >= 60 ? 'warning' : 'critical'
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-ink">
            Deal readiness <span className="tnum">{score}%</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
            {canDistribute ? 'This package is ready for lender distribution.' : blockingReason}
          </p>
        </div>
        <Link href={href}>
          <Button size="sm" variant={canDistribute ? 'primary' : 'secondary'}>
            {canDistribute ? 'Distribute deal' : 'Review checklist'}
          </Button>
        </Link>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn('h-full rounded-full', {
            'bg-positive': tone === 'positive',
            'bg-warning': tone === 'warning',
            'bg-critical': tone === 'critical',
          })}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </Card>
  )
}
