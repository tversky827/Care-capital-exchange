import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { listDiscrepancies } from '@/services/discrepancies'
import { Alert, Badge, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { SeverityBadge } from '@/components/deal/common'
import { ResolvePanel } from './resolve-panel'
import { reconcileAction } from '../../actions'
import { formatRelative, titleize } from '@/lib/utils/format'

/**
 * The discrepancy centre.
 *
 * Each item states both conflicting values with their sources, why it matters,
 * and the question a lender would ask — so a borrower can resolve it with the
 * operator in one message rather than working out what to ask.
 */
export default async function IssuesPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [items, documents, resolutions, users] = await Promise.all([
    listDiscrepancies(dealId),
    store.select('documents', { where: { deal_id: dealId } }),
    store.select('discrepancy_resolutions', { where: { deal_id: dealId }, orderBy: { field: 'created_at', dir: 'desc' } }),
    store.select('users', {}),
  ])

  const canEdit = canEditDeal(subjectOf(actor), deal)
  const open = items.filter((item) => item.status === 'open')
  const closed = items.filter((item) => item.status !== 'open')
  const documentName = new Map(documents.map((d) => [d.id, d.display_name]))
  const userName = new Map(users.map((u) => [u.id, u.full_name]))

  const criticalCount = open.filter((item) => item.severity === 'critical' || item.severity === 'high').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            {open.length === 0
              ? 'No items need attention'
              : `${open.length} item${open.length === 1 ? '' : 's'} need attention`}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            {criticalCount > 0
              ? `${criticalCount} of these will block distribution until resolved.`
              : open.length > 0
                ? 'None of these block distribution, but each is a question a lender is likely to ask.'
                : 'Every conflict and gap the reconciliation engine detected has been addressed.'}
          </p>
        </div>
        {canEdit ? (
          <InlineAction
            action={reconcileAction}
            label="Re-run reconciliation"
            hidden={{ dealId }}
            pendingLabel="Reconciling…"
          />
        ) : null}
      </div>

      {open.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing outstanding"
            description="The reconciliation engine compares every document against every other one — operating statements against tax returns, census against stated occupancy, the debt schedule against the balance sheet. It has found nothing unexplained."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {open.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={item.severity} />
                    <Badge tone="neutral">{titleize(item.category)}</Badge>
                    <span className="text-[11px] text-ink-muted">{formatRelative(item.created_at)}</span>
                  </div>
                  <h3 className="mt-1.5 text-[14px] font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{item.description}</p>
                </div>
              </div>

              <CardBody className="space-y-4">
                {item.conflicting_values.length > 0 ? (
                  <div>
                    <p className="eyebrow mb-1.5">Conflicting values</p>
                    <Table>
                      <thead>
                        <tr><Th>Figure</Th><Th numeric>Value</Th><Th>Source</Th></tr>
                      </thead>
                      <tbody>
                        {item.conflicting_values.map((value, index) => (
                          <Tr key={`${value.label}-${index}`}>
                            <Td className="text-ink-secondary">{value.label}</Td>
                            <Td numeric className="font-medium text-ink">{value.value}</Td>
                            <Td className="text-ink-muted">{value.source}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : null}

                {item.ai_explanation ? (
                  <div>
                    <p className="eyebrow mb-1">Why this matters</p>
                    <p className="text-[13px] leading-relaxed text-ink-secondary">{item.ai_explanation}</p>
                  </div>
                ) : null}

                {item.suggested_question ? (
                  <Alert tone="accent" title="Suggested question for the operator">
                    {item.suggested_question}
                  </Alert>
                ) : null}

                {item.document_ids.length > 0 ? (
                  <div>
                    <p className="eyebrow mb-1">Documents involved</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {item.document_ids.map((id) => (
                        <li key={id}>
                          <Badge tone="neutral">{documentName.get(id) ?? 'Document'}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {canEdit ? (
                  <ResolvePanel
                    dealId={dealId}
                    discrepancyId={item.id}
                    values={item.conflicting_values.map((value) => value.value)}
                  />
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <Section title={`Resolved (${closed.length})`} description="Kept on the record so the resolution is auditable.">
          <Table>
            <thead>
              <tr><Th>Item</Th><Th>Category</Th><Th>Outcome</Th><Th>Resolved by</Th><Th>Note</Th></tr>
            </thead>
            <tbody>
              {closed.map((item) => {
                const resolution = resolutions.find((entry) => entry.discrepancy_id === item.id)
                return (
                  <Tr key={item.id}>
                    <Td className="max-w-72 truncate text-ink">{item.title}</Td>
                    <Td className="text-ink-secondary">{titleize(item.category)}</Td>
                    <Td>
                      <Badge tone={item.status === 'resolved' ? 'positive' : 'neutral'}>{titleize(item.status)}</Badge>
                    </Td>
                    <Td className="text-ink-muted">
                      {resolution ? userName.get(resolution.resolved_by) ?? 'Platform' : '—'}
                    </Td>
                    <Td className="max-w-72 truncate text-[12px] text-ink-muted">{resolution?.resolution_note ?? '—'}</Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </Section>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
