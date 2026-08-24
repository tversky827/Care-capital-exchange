import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/** The wordmark. A drawn mark rather than an image keeps it crisp at any size. */
export function Logo({ className, showText = true, href = '/' }: { className?: string; showText?: boolean; href?: string | null }) {
  const content = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <rect width="20" height="20" rx="2" fill="#1f4e79" />
        <path d="M5 13.5V6.5h2.2v5.1h3V6.5h2.2v7z" fill="#fff" opacity="0.95" />
        <rect x="14.2" y="6.5" width="1.4" height="7" fill="#fff" opacity="0.55" />
      </svg>
      {showText ? (
        <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
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
