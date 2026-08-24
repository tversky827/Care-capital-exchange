import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * The base component set.
 *
 * These are intentionally plain: square-ish corners, hairline borders, no
 * shadows beyond a single hairline, and no animation beyond a colour
 * transition. The visual weight belongs to the data.
 */

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('border border-line bg-surface', className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-start justify-between gap-4 border-b border-line px-4 py-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-[13px] font-semibold text-ink', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-0.5 text-[12px] leading-relaxed text-ink-muted', className)} {...props} />
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}

export function Section({
  title, description, actions, children, className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      {children}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-ink-inverse border-accent hover:bg-accent-hover disabled:bg-ink-muted disabled:border-ink-muted',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-critical text-ink-inverse border-critical hover:opacity-90',
  link: 'bg-transparent border-transparent text-accent hover:underline p-0 h-auto',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-8 px-3 text-[13px]',
  lg: 'h-10 px-4 text-[14px]',
}

export function Button({
  className, variant = 'secondary', size = 'md', ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 border font-medium transition-colors rounded-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        variant !== 'link' && BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Badges and status
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'critical' | 'progress' | 'closed'

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-ink-secondary border-line',
  accent: 'bg-accent-soft text-accent border-accent-line',
  positive: 'bg-positive-soft text-positive border-positive/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  critical: 'bg-critical-soft text-critical border-critical/20',
  progress: 'bg-accent-soft text-accent border-accent-line',
  closed: 'bg-neutral-soft text-ink-muted border-line',
}

export function Badge({
  tone = 'neutral', className, ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-medium rounded-[2px]',
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    />
  )
}

export function StatusDot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-ink-muted', accent: 'bg-accent', positive: 'bg-positive',
    warning: 'bg-warning', critical: 'bg-critical', progress: 'bg-accent', closed: 'bg-line-strong',
  }
  return <span className={cn('inline-block size-1.5 rounded-full', colors[tone], className)} />
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />
    </div>
  )
}

export function Th({ className, numeric, ...props }: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, numeric, ...props }: ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn('border-b border-line px-3 py-2 align-middle', numeric && 'text-right', className)}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-surface-sunken/60', className)} {...props} />
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('block text-[12px] font-medium text-ink-secondary', className)} {...props} />
}

const FIELD_BASE =
  'w-full border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-muted rounded-[3px] transition-colors focus:border-accent disabled:bg-surface-sunken disabled:text-ink-muted'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_BASE, 'h-8', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-20 resize-y leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(FIELD_BASE, 'h-8 pr-8', className)} {...props} />
}

export function Field({
  label, hint, error, htmlFor, children, className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12px] text-critical">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Alert({
  tone = 'neutral', title, children, className, icon,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <div className={cn('flex gap-2.5 border p-3 text-[13px] rounded-[3px]', TONE_STYLES[tone], className)}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  title, description, action, icon, className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon ? <div className="mb-3 text-ink-muted">{icon}</div> : null}
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Progress({
  value, tone = 'accent', className, showLabel = false,
}: {
  value: number
  tone?: Tone
  className?: string
  showLabel?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const fills: Record<Tone, string> = {
    neutral: 'bg-ink-muted', accent: 'bg-accent', positive: 'bg-positive',
    warning: 'bg-warning', critical: 'bg-critical', progress: 'bg-accent', closed: 'bg-line-strong',
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden bg-surface-sunken rounded-full">
        <div className={cn('h-full rounded-full transition-all', fills[tone])} style={{ width: `${clamped}%` }} />
      </div>
      {showLabel ? <span className="tnum w-9 text-right text-[11px] text-ink-muted">{Math.round(clamped)}%</span> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow, title, description, actions, className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h1 className="text-[20px] font-semibold leading-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function DefinitionList({
  items, columns = 2, className,
}: {
  items: { label: string; value: ReactNode; hint?: string }[]
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  const grid = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns]
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', grid, className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border-b border-line pb-2">
          <dt className="text-[11px] uppercase tracking-[0.04em] text-ink-muted">{item.label}</dt>
          <dd className="tnum mt-0.5 truncate text-[13px] font-medium text-ink" title={typeof item.value === 'string' ? item.value : undefined}>
            {item.value}
          </dd>
          {item.hint ? <dd className="mt-0.5 text-[11px] text-ink-muted">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

export function Stat({
  label, value, delta, hint, tone, className,
}: {
  label: string
  value: ReactNode
  delta?: { value: string; tone: Tone } | null
  hint?: ReactNode
  tone?: Tone
  className?: string
}) {
  const valueTone = tone === 'critical' ? 'text-critical' : tone === 'positive' ? 'text-positive' : 'text-ink'
  return (
    <div className={cn('px-4 py-3', className)}>
      <p className="text-[11px] uppercase tracking-[0.04em] text-ink-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('tnum text-[19px] font-semibold leading-none', valueTone)}>{value}</span>
        {delta ? (
          <span className={cn('tnum text-[12px] font-medium', {
            'text-positive': delta.tone === 'positive',
            'text-critical': delta.tone === 'critical',
            'text-ink-muted': delta.tone === 'neutral',
            'text-warning': delta.tone === 'warning',
          })}>
            {delta.value}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  )
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />
}
