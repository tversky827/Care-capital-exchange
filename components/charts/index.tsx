import { cn } from '@/lib/utils/cn'

/**
 * Charts.
 *
 * Hand-drawn SVG rather than a charting library: these are small, dense,
 * financial charts with fixed requirements, and a dependency-free
 * implementation keeps them consistent with the rest of the interface and off
 * the client bundle entirely — every chart here renders on the server.
 */

const PALETTE = ['#1f4e79', '#4a7fa8', '#7ba7c7', '#a8c5dc', '#cfdeeb', '#9a5b06']

export interface SeriesPoint {
  label: string
  value: number | null
}

// ---------------------------------------------------------------------------

export function Sparkline({
  points, width = 120, height = 28, tone = 'accent', className,
}: {
  points: (number | null)[]
  width?: number
  height?: number
  tone?: 'accent' | 'positive' | 'critical'
  className?: string
}) {
  const values = points.filter((p): p is number => p !== null)
  if (values.length < 2) return <div className={cn('h-7', className)} />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${(height - ((value - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ')

  const stroke = tone === 'positive' ? '#14714f' : tone === 'critical' ? '#a32218' : '#1f4e79'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1]! - min) / span) * (height - 4) - 2}
        r="2"
        fill={stroke}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------

export function BarChart({
  series, height = 140, format, className, tone,
}: {
  series: SeriesPoint[]
  height?: number
  format?: (value: number) => string
  className?: string
  tone?: (point: SeriesPoint, index: number) => string
}) {
  const values = series.map((s) => s.value ?? 0)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const zeroLine = (max / span) * height

  return (
    <div className={className}>
      <div className="flex items-end gap-2" style={{ height }}>
        {series.map((point, index) => {
          const value = point.value ?? 0
          const barHeight = Math.max(2, (Math.abs(value) / span) * height)
          return (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height }}>
              {point.value !== null ? (
                <span className="tnum mb-1 whitespace-nowrap text-[10px] font-medium text-ink-secondary">
                  {format ? format(point.value) : point.value.toLocaleString()}
                </span>
              ) : null}
              <div
                className="w-full max-w-14 rounded-t-[2px]"
                style={{
                  height: barHeight,
                  background: tone ? tone(point, index) : PALETTE[Math.min(index, PALETTE.length - 1)],
                }}
                title={`${point.label}: ${point.value ?? 'not provided'}`}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-2 border-t border-line pt-1.5" style={{ marginTop: zeroLine ? undefined : 0 }}>
        {series.map((point) => (
          <div key={point.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-ink-muted">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function DonutChart({
  segments, size = 132, thickness = 16, centerLabel, centerValue, className,
}: {
  segments: { label: string; value: number; color?: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total === 0 ? (
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eeeeea" strokeWidth={thickness} />
          ) : (
            segments.map((segment, index) => {
              const fraction = segment.value / total
              const dash = fraction * circumference
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color ?? PALETTE[index % PALETTE.length]}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += dash
              return element
            })
          )}
        </g>
        {centerValue ? (
          <>
            <text x="50%" y="47%" textAnchor="middle" className="fill-ink" style={{ fontSize: 18, fontWeight: 600 }}>
              {centerValue}
            </text>
            <text x="50%" y="61%" textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 9, letterSpacing: '0.06em' }}>
              {centerLabel?.toUpperCase()}
            </text>
          </>
        ) : null}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-[1px]"
                style={{ background: segment.color ?? PALETTE[index % PALETTE.length] }}
              />
              <span className="truncate text-ink-secondary">{segment.label}</span>
            </span>
            <span className="tnum shrink-0 font-medium text-ink">
              {total ? `${((segment.value / total) * 100).toFixed(1)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ScoreRing({
  score, size = 96, label, sublabel, tone = 'accent',
}: {
  score: number
  size?: number
  label?: string
  sublabel?: string
  tone?: 'accent' | 'positive' | 'warning' | 'critical'
}) {
  const thickness = 8
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference
  const colors = { accent: '#1f4e79', positive: '#14714f', warning: '#9a5b06', critical: '#a32218' }

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eeeeea" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={colors[tone]} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </g>
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" className="fill-ink" style={{ fontSize: size * 0.28, fontWeight: 600 }}>
          {Math.round(score)}
        </text>
      </svg>
      {label ? (
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          {sublabel ? <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{sublabel}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function HorizontalMeter({
  label, value, max = 100, detail, tone = 'accent',
}: {
  label: string
  value: number
  max?: number
  detail?: string
  tone?: 'accent' | 'positive' | 'warning' | 'critical' | 'neutral'
}) {
  const colors = {
    accent: 'bg-accent', positive: 'bg-positive', warning: 'bg-warning',
    critical: 'bg-critical', neutral: 'bg-ink-muted',
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12px] text-ink-secondary">{label}</span>
        <span className="tnum shrink-0 text-[12px] font-medium text-ink">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn('h-full rounded-full', colors[tone])} style={{ width: `${pct}%` }} />
      </div>
      {detail ? <p className="text-[11px] leading-snug text-ink-muted">{detail}</p> : null}
    </div>
  )
}

/** Vertically stacked comparison of a metric against a lender threshold. */
export function ThresholdBar({
  label, value, threshold, unit = '', higherIsBetter = true,
}: {
  label: string
  value: number | null
  threshold: number | null
  unit?: string
  higherIsBetter?: boolean
}) {
  if (value === null || threshold === null) {
    return (
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-ink-secondary">{label}</span>
        <span className="text-ink-muted">Not available</span>
      </div>
    )
  }
  const passes = higherIsBetter ? value >= threshold : value <= threshold
  const scale = Math.max(value, threshold) * 1.25
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-ink-secondary">{label}</span>
        <span className={cn('tnum font-medium', passes ? 'text-positive' : 'text-critical')}>
          {value}{unit} <span className="text-ink-muted">vs {threshold}{unit}</span>
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn('h-full rounded-full', passes ? 'bg-positive' : 'bg-critical')}
          style={{ width: `${Math.min(100, (value / scale) * 100)}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-ink"
          style={{ left: `${Math.min(100, (threshold / scale) * 100)}%` }}
          title={`Lender threshold: ${threshold}${unit}`}
        />
      </div>
    </div>
  )
}
