import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Progress } from '@/components/ui/primitives'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { Offering, OfferingTerms } from '@/types'

export interface RaiseRow {
  dealId: string
  /** The property this raise is against. */
  name: string
  location: string
  beds: number | null
  offering: Offering | null
  terms: OfferingTerms | null
  /** What the sponsor should do next, and where doing it starts. */
  next: { label: string; href: string; primary: boolean }
  /** Investors who have committed, when a raise is open. */
  investors: number
}

/**
 * The sponsor's home.
 *
 * One row per raise, and every row answers the same three questions in the same
 * order: what is it, how far along is it, and what do I do next. A sponsor with
 * four properties should be able to see which one needs them without opening
 * anything.
 *
 * There is no filter strip and no status taxonomy on this screen. A sponsor
 * running a handful of raises does not need to filter them, and the seven
 * offering statuses mean nothing to someone who has not read the schema — each
 * row says what is true of it in a sentence instead.
 */
export function RaisesList({ rows, companyName }: { rows: RaiseRow[]; companyName: string }) {
  const open = rows.filter((row) => row.offering?.status === 'live').length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={companyName}
        title="My raises"
        description={
          rows.length === 0
            ? 'Raise equity from private investors against the healthcare properties you operate.'
            : `${rows.length} ${rows.length === 1 ? 'property' : 'properties'}${open > 0 ? `, ${open} open to investors` : ''}.`
        }
        actions={
          <Link href="/deals/new">
            <Button variant="primary" className="gap-1.5">
              <Plus className="size-4" /> Add a property
            </Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No properties yet"
            description="Start with one property. You need only its name, where it is, and what you are raising — everything else can follow."
            action={
              <Link href="/deals/new">
                <Button variant="primary">Add your first property</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <RaiseCard key={row.dealId} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

function RaiseCard({ row }: { row: RaiseRow }) {
  const { offering, terms } = row
  const target = offering?.target_raise ?? null
  const pct = target && target > 0 ? (offering!.committed_amount / target) * 100 : null

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/deals/${row.dealId}`} className="text-[15px] font-semibold text-ink hover:text-accent">
            {row.name}
          </Link>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            {[row.location, row.beds ? `${row.beds} beds` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <RaiseStatus offering={offering} />
      </div>

      {offering ? (
        <div className="mt-3.5 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Raising" value={formatCurrency(target, { compact: true })} />
          <Figure
            label="Target return"
            value={terms?.target_irr_pct ? `${formatPercent(terms.target_irr_pct)} IRR` : '—'}
            hint={terms?.target_irr_pct ? 'Projected, not promised' : undefined}
          />
          <Figure
            label="Committed"
            value={formatCurrency(offering.committed_amount, { compact: true })}
            hint={`${row.investors} ${row.investors === 1 ? 'investor' : 'investors'}`}
          />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.04em] text-ink-muted">Progress</p>
            <div className="mt-2">
              {pct === null ? (
                <span className="text-[13px] text-ink-muted">No target set</span>
              ) : (
                <Progress value={pct} tone={pct >= 100 ? 'positive' : 'accent'} showLabel />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[12px] text-ink-secondary">{describeNext(row)}</p>
        <Link href={row.next.href} className="shrink-0">
          <Button size="sm" variant={row.next.primary ? 'primary' : 'secondary'} className="gap-1.5">
            {row.next.label} <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.04em] text-ink-muted">{label}</p>
      <p className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  )
}

function RaiseStatus({ offering }: { offering: Offering | null }) {
  if (!offering) return <Badge tone="neutral">No raise yet</Badge>
  if (offering.status === 'live') return <Badge tone="positive">Open to investors</Badge>
  if (offering.status === 'fully_subscribed') return <Badge tone="positive">Fully subscribed</Badge>
  if (offering.status === 'closed') return <Badge tone="closed">Closed</Badge>
  if (offering.status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>
  if (offering.status === 'paused') return <Badge tone="warning">Paused</Badge>
  if (offering.status === 'draft') return <Badge tone="neutral">Draft</Badge>
  return <Badge tone="progress">Awaiting review</Badge>
}

/** The status taxonomy in a sentence, because nobody reads a badge for meaning. */
function describeNext(row: RaiseRow): string {
  const { offering } = row
  if (!offering) return 'This property has no raise yet. Set your terms and investors can start reviewing it.'
  switch (offering.status) {
    case 'draft':
      return 'Your raise is a draft. Nobody outside your company can see it yet.'
    case 'under_review':
    case 'compliance_review':
      return 'Submitted for review. We will tell you as soon as it can go live.'
    case 'ready':
      return 'Reviewed and ready. Publishing opens it to matched investors.'
    case 'live':
      return row.investors > 0
        ? `${row.investors} ${row.investors === 1 ? 'investor has' : 'investors have'} committed so far.`
        : 'Open to investors. No commitments yet.'
    case 'paused':
      return 'Paused. Investors cannot commit while it is paused.'
    case 'fully_subscribed':
      return 'Fully subscribed. Nothing further is needed from you here.'
    case 'closed':
      return 'This raise is closed.'
    default:
      return 'This raise was cancelled.'
  }
}
