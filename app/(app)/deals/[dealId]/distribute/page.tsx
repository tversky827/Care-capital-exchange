import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'
import { subjectOf } from '@/lib/access'
import { canDistributeDeal } from '@/lib/policy'
import { previewDistribution } from '@/services/distribution'
import { readinessFor } from '@/services/underwriting'
import { buildDataRequests } from '@/lib/ai/local/data-requests'
import { Alert, Badge, Card, EmptyState, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { DistributePanel } from './distribute-panel'
import { InlineAction } from '@/components/forms/action-form'
import { revokeDistributionAction } from '../../actions'
import { formatRelative, titleize } from '@/lib/utils/format'

/**
 * Distribution.
 *
 * Before anything leaves the borrower's control they see the exact list of
 * institutions that will receive the package, and must confirm. The readiness
 * gate is enforced here as well as in the service, and an override is available
 * only to an administrator and is recorded as an override.
 */
export default async function DistributePage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [preview, readiness, distributions, lenders, boxes, documents] = await Promise.all([
    previewDistribution(dealId),
    readinessFor(dealId),
    store.select('deal_distributions', { where: { deal_id: dealId } }),
    store.select('lenders', {}),
    store.select('lender_lending_boxes', { where: { active: true } }),
    store.select('documents', { where: { deal_id: dealId, deleted_at: { isNull: true } } }),
  ])

  const canDistribute = canDistributeDeal(subjectOf(actor), deal)
  const lenderName = new Map(lenders.map((lender) => [lender.id, lender.institution_name]))
  const live = distributions.filter((entry) => entry.status !== 'revoked')

  // Document requirements are computed against the lenders actually being
  // approached, so a borrower is never asked for something nobody needs.
  const targetBoxes = boxes.filter((box) => preview.lenders.some((row) => row.lender.id === box.lender_id))
  const dataRequests = readiness
    ? buildDataRequests(readiness, {
        presentDocTypes: new Set(documents.map((document) => document.doc_type)),
        targetBoxes,
        taxReturnYearsOnFile: documents.filter((document) => document.doc_type === 'tax_return').length,
      })
    : { items: [] }

  return (
    <div className="space-y-4">
      {readiness && !readiness.canDistribute ? (
        <Alert tone="warning" title={`Deal readiness is ${readiness.overall}%`}>
          {readiness.blockingReason} A package that arrives incomplete costs the borrower credibility
          on the first impression, so distribution is gated until the required items are present.
          {actor.isAdmin ? ' As an administrator you can override this, and the override is recorded.' : ''}
        </Alert>
      ) : (
        <Alert tone="positive" title={`This package is ready — ${readiness?.overall ?? 0}% complete`}>
          Every required item is present. Review the recipient list below before confirming.
        </Alert>
      )}

      {readiness && readiness.outstanding.length > 0 ? (
        <Section
          title="Recommended before distribution"
          description="Generated from the platform's own checklist and from the documentary requirements of the specific lenders you are approaching."
        >
          <Table>
            <thead><tr><Th>Item</Th><Th>Why</Th><Th>Importance</Th></tr></thead>
            <tbody>
              {dataRequests.items.slice(0, 12).map((item) => (
                <Tr key={item.label}>
                  <Td className="font-medium text-ink">{item.label}</Td>
                  <Td className="max-w-96 text-[12px] text-ink-secondary">{item.detail}</Td>
                  <Td>
                    <Badge tone={item.importance === 'required' ? 'critical' : item.importance === 'recommended' ? 'warning' : 'neutral'}>
                      {titleize(item.importance)}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      {live.length > 0 ? (
        <Section title={`Currently shared with ${live.length} lender${live.length === 1 ? '' : 's'}`}>
          <Table>
            <thead>
              <tr><Th>Institution</Th><Th>Status</Th><Th>Pipeline stage</Th><Th numeric>Views</Th><Th numeric>Last viewed</Th><Th /></tr>
            </thead>
            <tbody>
              {live.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="font-medium text-ink">{lenderName.get(entry.lender_id) ?? 'Unknown lender'}</Td>
                  <Td><Badge tone={entry.status === 'engaged' ? 'positive' : entry.status === 'passed' ? 'neutral' : 'accent'}>{titleize(entry.status)}</Badge></Td>
                  <Td className="text-ink-secondary">{titleize(entry.pipeline_stage)}</Td>
                  <Td numeric>{entry.view_count || '—'}</Td>
                  <Td numeric className="whitespace-nowrap text-ink-muted">
                    {entry.last_viewed_at ? formatRelative(entry.last_viewed_at) : 'Not yet opened'}
                  </Td>
                  <Td>
                    {canDistribute ? (
                      <InlineAction
                        action={revokeDistributionAction}
                        label="Revoke access"
                        variant="ghost"
                        hidden={{ dealId, distributionId: entry.id, reason: 'Access withdrawn by the borrower.' }}
                        confirm={`Revoke ${lenderName.get(entry.lender_id)}'s access to this deal? They will lose access to the package and the data room immediately. Anything they have already downloaded remains in their possession.`}
                      />
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      {!canDistribute ? (
        <Card>
          <EmptyState
            title="Distribution requires an owner or administrator"
            description="Your role on this organisation can view and edit the deal but cannot share it with lenders."
          />
        </Card>
      ) : preview.lenders.length === 0 ? (
        <Card>
          <EmptyState
            title="No lender currently matches this opportunity"
            description="Every verified lender fails at least one of their own stated boundaries. Review the match page to see exactly which test each one failed — often a small change to the requested amount brings several back inside their box."
          />
        </Card>
      ) : (
        <DistributePanel
          dealId={dealId}
          isAdmin={actor.isAdmin}
          canDistributeNow={preview.canDistribute}
          blockingReason={preview.blockingReason}
          anonymised={deal.anonymize_in_marketplace}
          lenders={preview.lenders.map((row) => ({
            id: row.lender.id,
            name: row.lender.institution_name,
            type: titleize(row.lender.institution_type),
            initials: row.lender.logo_initials,
            score: row.score,
            band: row.band,
            alreadySent: row.alreadySent,
          }))}
        />
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
