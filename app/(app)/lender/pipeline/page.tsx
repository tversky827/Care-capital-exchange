import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { pipelineForLender } from '@/services/distribution'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { subjectOf } from '@/lib/access'
import { canViewDealIdentity } from '@/lib/policy'
import { displayName } from '@/lib/deal/display'
import { Alert, Card, EmptyState } from '@/components/ui/primitives'
import { PipelineBoard } from './board'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function PipelinePage() {
  const actor = await requireActor()
  if (!actor.isLender) redirect(actor.isAdmin ? '/admin' : '/dashboard')
  const lender = actor.lender
  if (!lender) redirect('/lender')

  if (lender.verification_status !== 'verified') {
    return (
      <Alert tone="warning" title="Pipeline access requires verification">
        Opportunities appear here once a platform administrator verifies your institution.
      </Alert>
    )
  }

  const store = await db()
  const distributions = (await pipelineForLender(lender.id)).filter((entry) => entry.status !== 'revoked')

  const cards = (
    await Promise.all(
      distributions.map(async (distribution) => {
        const snapshot = await buildSnapshot(distribution.deal_id)
        if (!snapshot) return null
        const indication = await store.selectOne('indications', {
          where: { deal_id: distribution.deal_id, lender_id: lender.id, status: { in: ['submitted', 'updated', 'selected'] } },
        })
        const match = await store.selectOne('matches', {
          where: { deal_id: distribution.deal_id, lender_id: lender.id },
        })
        const canSeeIdentity = canViewDealIdentity(subjectOf(actor), snapshot.deal, { distribution })
        return {
          id: distribution.id,
          dealId: distribution.deal_id,
          stage: distribution.pipeline_stage,
          title: displayName(snapshot.deal, snapshot.facility, canSeeIdentity),
          state: snapshot.facility?.state ?? '—',
          amount: formatCurrency(snapshot.summary.loanAmount, { compact: true }),
          ltv: formatPercent(snapshot.summary.ltv, 0),
          dscr: formatRatio(snapshot.summary.dscr),
          matchScore: match?.score ?? null,
          indication: indication
            ? `${formatCurrency(indication.loan_amount, { compact: true })} @ ${formatPercent(indication.all_in_rate_pct, 2)}`
            : null,
          viewCount: distribution.view_count,
        }
      }),
    )
  ).filter((card): card is NonNullable<typeof card> => card !== null)

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">{lender.institution_name}</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Pipeline</h1>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
          Drag a card between stages, or use the stage control on each card. The borrower sees your
          engagement level — never your internal notes or the terms you are considering.
        </p>
      </div>

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            title="No opportunities in your pipeline"
            description="Deals appear here when a borrower distributes an opportunity to your institution, or when you engage with one from the marketplace."
            action={<Link href="/marketplace" className="text-[13px] text-accent hover:underline">Browse the marketplace</Link>}
          />
        </Card>
      ) : (
        <PipelineBoard cards={cards} />
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
