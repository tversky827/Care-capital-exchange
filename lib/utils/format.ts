/** Presentation helpers. Formatting only — no business logic lives here. */

const UNKNOWN = '—'

export function formatCurrency(value: number | null | undefined, options: { compact?: boolean; decimals?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN
  if (options.compact) {
    const abs = Math.abs(value)
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: options.decimals ?? 0,
    maximumFractionDigits: options.decimals ?? 0,
  }).format(value)
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN
  return `${value.toFixed(decimals)}%`
}

export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN
  return `${value.toFixed(decimals)}x`
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDate(value: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!value) return UNKNOWN
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return UNKNOWN
  return new Intl.DateTimeFormat('en-US', {
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return UNKNOWN
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return UNKNOWN
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(date)
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return UNKNOWN
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return UNKNOWN
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return UNKNOWN
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

/** `snake_case` / `kebab-case` enum values to display labels. */
export function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bSnf\b/g, 'SNF')
    .replace(/\bAlf\b/g, 'ALF')
    .replace(/\bLoi\b/g, 'LOI')
    .replace(/\bIo\b/g, 'IO')
    .replace(/\bLtv\b/g, 'LTV')
    .replace(/\bDscr\b/g, 'DSCR')
    .replace(/\bCms\b/g, 'CMS')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bCapex\b/gi, 'CapEx')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
