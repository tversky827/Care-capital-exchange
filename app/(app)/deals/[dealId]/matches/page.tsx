import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { canDistributeDeal } from '@/lib/policy'
import { matchesForDeal } from '@/services/matching'
import { distributionsForDeal } from '@/services/distribution'
import { BAND_LABELS } from '@/lib/matching/engine'
import {
  Alert, Badge, Button, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr, type Tone,
} from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { recomputeMatchesAction } from '../../actions'
import { formatCurrency, formatRelative, titleize } from '@/lib/utils/format'
import { requireDebtMarketplace } from '@/lib/product'

const BAND_TONE: Record<string, Tone> = {
  strong: 'positive', good: 'accent', possible: 'warning', outside_box: 'neutral',
}

/**
 * Lender matches.
 *
 * Each match shows its factor-level reasoning, because a percentage on its own
 * is not actionable. The language is precise throughout: a lender "appears to
 * be a strong fit based on its stated lending criteria" — never that it will
 * approve anything.
 */
export default async function MatchesPage({ params }: { params: Promise<{ dealId: string }> }) {
  requireDebtMarketplace()
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [all, distributions] = await Promise.all([
    matchesForDeal(dealId, true),
    distributionsForDeal(dealId),
  ])
  const distributedTo = new Map(distributions.map((d) => [d.lender_id, d]))
  const inBox = all.filter((row) => !row.match.hard_fail)
  const outside = all.filter((row) => row.match.hard_fail)
  const canDistribute = canDistributeDeal(subjectOf(actor), deal)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            {inBox.length} lender{inBox.length === 1 ? '' : 's'} match this opportunity
          </h2>
          <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
            Matching compares your deal against each verified lender&apos;s published criteria. A match
            reflects those criteria only — it is not an indication that any lender will offer financing.
          </p>
        </div>
        <div className="flex gap-2">
          {canDistribute ? (
            <InlineAction action={recomputeMatchesAction} label="Recompute" hidden={{ dealId }} pendingLabel="Matching…" />
          ) : null}
          <Link href={`/deals/${dealId}/distribute`}>
            <Button size="sm" variant="primary">Distribute deal</Button>
          </Link>
        </div>
      </div>

      {inBox.length === 0 ? (
        <Card>
          <EmptyState
            title="No lender currently matches this opportunity"
            description="Every verified lender fails at least one of their own stated boundaries on this deal. The most common causes are leverage above a lender's maximum, a state outside their footprint, or a transaction type they do not finance. The list below shows exactly which test each one failed."
          />
        </Card>
      ) : null}

      <div className="space-y-3">
        {inBox.map(({ match, lender, box }) => {
          const distribution = distributedTo.get(lender.id)
          return (
            <Card key={match.id}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-3">
                <div className="flex min-w-0 gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center bg-accent text-[12px] font-semibold text-white rounded-[2px]">
                    {lender.logo_initials}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/lenders/${lender.id}`} className="text-[14px] font-semibold text-ink hover:underline">
                        {lender.institution_name}
                      </Link>
                      <Badge tone={BAND_TONE[match.band]}>{BAND_LABELS[match.band]}</Badge>
                      {distribution && distribution.status !== 'revoked' ? (
                        <Badge tone="accent">
                          {distribution.status === 'sent' ? 'Sent' : titleize(distribution.pipeline_stage)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {titleize(lender.institution_type)}
                      {box?.min_loan && box.max_loan
                        ? ` · ${formatCurrency(box.min_loan, { compact: true })}–${formatCurrency(box.max_loan, { compact: true })}`
                        : ''}
                      {box?.typical_rate_low_pct
                        ? ` · typically ${box.typical_rate_low_pct}%–${box.typical_rate_high_pct}%`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="tnum text-[24px] font-semibold leading-none text-ink">{match.score}%</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.05em] text-ink-muted">Match score</p>
                </div>
              </div>

              <CardBody className="space-y-4">
                {match.ai_explanation ? (
                  <p className="text-[13px] leading-relaxed text-ink-secondary">{match.ai_explanation}</p>
                ) : null}

                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {match.factors.map((factor) => (
                    <div key={factor.key} className="flex gap-2 text-[12px]">
                      <span className="mt-0.5 shrink-0">
                        {factor.status === 'pass' ? (
                          <span className="text-positive">✓</span>
                        ) : factor.status === 'concern' ? (
                          <span className="text-warning">⚠</span>
                        ) : factor.status === 'fail' ? (
                          <span className="text-critical">✕</span>
                        ) : (
                          <span className="text-ink-muted">○</span>
                        )}
                      </span>
                      <span className="min-w-0 leading-relaxed text-ink-secondary">{factor.detail}</span>
                    </div>
                  ))}
                </div>

                {distribution && distribution.view_count > 0 ? (
                  <Alert tone="accent">
                    {lender.institution_name} has opened this deal {distribution.view_count} time
                    {distribution.view_count === 1 ? '' : 's'}, most recently{' '}
                    {formatRelative(distribution.last_viewed_at)}.
                  </Alert>
                ) : null}
              </CardBody>
            </Card>
          )
        })}
      </div>

      {outside.length > 0 ? (
        <Section
          title={`Outside stated lending criteria (${outside.length})`}
          description="Shown so you can see exactly why. Lenders do make exceptions, but a deal outside a stated boundary is rarely the best use of a first approach."
        >
          <Table>
            <thead>
              <tr><Th>Institution</Th><Th>Type</Th><Th>Reason it falls outside</Th><Th numeric>Score</Th></tr>
            </thead>
            <tbody>
              {outside.map(({ match, lender }) => (
                <Tr key={match.id}>
                  <Td className="font-medium text-ink">{lender.institution_name}</Td>
                  <Td className="text-ink-secondary">{titleize(lender.institution_type)}</Td>
                  <Td className="text-[12px] text-ink-secondary">
                    {match.factors.filter((f) => f.status === 'fail').map((f) => f.detail).join(' ')}
                  </Td>
                  <Td numeric className="text-ink-muted">{match.score}%</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
