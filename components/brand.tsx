import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * The mark.
 *
 * A capital stack that is also a building. Three bands, widening downward:
 * senior debt at the base, then what sits above it, then the equity — the one
 * thing CareCapital actually sells — crowned with a rounded top so the whole
 * reads as a structure rather than a chart.
 *
 * That double meaning is the point. The business is capital for buildings that
 * house people, and a mark that says only "finance" or only "healthcare" would
 * be describing half of it.
 *
 * Drawn rather than an image so it stays crisp at any size, and built from
 * three flat shapes so it survives the 16-pixel favicon, monochrome print and
 * a dark ground without a second drawing.
 */

/** The brand's three tints. Fixed values: a logo's colours are the logo. */
const BRAND = {
  equity: '#1f4e79',
  middle: '#3f6f9c',
  base: '#7ba0c4',
} as const

const INVERSE = {
  equity: '#a9c6e0',
  middle: '#6d97bd',
  base: '#41668a',
} as const

export function LogoMark({
  size = 20, tone = 'brand', className,
}: {
  size?: number
  /** `mono` for print and stamps; `inverse` on a dark ground. */
  tone?: 'brand' | 'mono' | 'inverse'
  className?: string
}) {
  const c = tone === 'mono'
    ? { equity: 'currentColor', middle: 'currentColor', base: 'currentColor' }
    : tone === 'inverse' ? INVERSE : BRAND

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {/* Equity: the crown, and the only band with a rounded top. */}
      <path d="M10.5 12.4V9a3.5 3.5 0 0 1 3.5-3.5h4A3.5 3.5 0 0 1 21.5 9v3.4z" fill={c.equity} />
      <rect x="6.5" y="15.1" width="19" height="5.2" rx="1.1" fill={c.middle} />
      <rect x="2.5" y="22.9" width="27" height="5.2" rx="1.1" fill={c.base} />
    </svg>
  )
}

/** The wordmark: the mark plus the name. */
export function Logo({
  className, showText = true, href = '/', tone = 'brand', size = 20,
}: {
  className?: string
  showText?: boolean
  href?: string | null
  tone?: 'brand' | 'mono' | 'inverse'
  size?: number
}) {
  const content = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} tone={tone} />
      {showText ? (
        <span className="text-[14px] font-semibold tracking-[-0.012em] text-ink">
          CareCapital<span className="font-normal text-ink-muted"> Exchange</span>
        </span>
      ) : null}
    </span>
  )
  return href ? <Link href={href} className="inline-flex">{content}</Link> : content
}

/** Persistent, unmissable label on fictional data. */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div className={cn('border-b border-warning/25 bg-warning-soft px-4 py-1.5 text-center text-[11px] font-medium text-warning', className)}>
      DEMO DATA — NOT REAL TRANSACTIONS. Every company, facility, figure and lender shown is fictional.
    </div>
  )
}
