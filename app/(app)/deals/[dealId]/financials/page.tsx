import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { buildSnapshot, effectiveValue } from '@/lib/deal/snapshot'
import { Badge, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { ConfidenceBadge, MetricTile } from '@/components/deal/common'
import { ApproveRow } from './approve-row'
import { formatCurrency, formatPercent, titleize } from '@/lib/utils/format'
import { LINE_ITEM_KEYS, type LineItemKey } from '@/types'

/**
 * Financials.
 *
 * A spread with every period side by side, plus the extraction review queue:
 * figures the pipeline proposed that have not yet been approved by a person.
 * Until a figure is approved it is used but marked, and it blocks distribution.
 */
export default async function FinancialsPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const store = await db()
  const [lineItems, documents] = await Promise.all([
    store.select('financial_line_items', { where: { deal_id: dealId } }),
    store.select('documents', { where: { deal_id: dealId } }),
  ])
  const documentName = new Map(documents.map((d) => [d.id, d.display_name]))
  const canEdit = canEditDeal(subjectOf(actor), snapshot.deal)

  const periods = snapshot.periods
  const pending = lineItems.filter((item) => item.approved_value === null && item.proposed_value !== null)

  // Only render rows that have a value in at least one period.
  const rows = LINE_ITEM_KEYS.filter((key) => periods.some((period) => period.items[key] != null))

  return (
    <div className="space-y-4">
      {pending.length > 0 ? (
        <Section
          title={`${pending.length} extracted ${pending.length === 1 ? 'value' : 'values'} awaiting your approval`}
          description="Extraction proposes; a person approves. Until you approve a figure it is shown with its confidence and the deal cannot be distributed."
        >
          <Table>
            <thead>
              <tr>
                <Th>Line item</Th>
                <Th>Period</Th>
                <Th numeric>Proposed value</Th>
                <Th>Confidence</Th>
                <Th>Source</Th>
                <Th className="w-64">Approve</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => {
                const period = periods.find((p) => p.period.id === item.period_id)
                return (
                  <Tr key={item.id}>
                    <Td className="font-medium text-ink">{titleize(item.key)}</Td>
                    <Td className="text-ink-secondary">{period?.period.label ?? '—'}</Td>
                    <Td numeric>{formatCurrency(item.proposed_value)}</Td>
                    <Td><ConfidenceBadge confidence={item.confidence} /></Td>
                    <Td className="max-w-48 truncate text-[12px] text-ink-muted">
                      {item.source_document_id ? documentName.get(item.source_document_id) ?? 'Uploaded document' : 'Manual entry'}
                      {item.source_page ? `, p.${item.source_page}` : ''}
                    </Td>
                    <Td>
                      {canEdit ? (
                        <ApproveRow dealId={dealId} lineItemId={item.id} proposed={item.proposed_value} />
                      ) : (
                        <span className="text-[12px] text-ink-muted">Read-only</span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </Section>
      ) : null}

      <Section
        title="Financial spread"
        description={
          periods.length
            ? `${periods.length} period${periods.length === 1 ? '' : 's'}. Approved figures are the deal's figures of record.`
            : undefined
        }
      >
        {periods.length === 0 ? (
          <EmptyState
            title="No financial periods yet"
            description="Upload operating statements and the pipeline will extract each period, or enter figures directly from the deal wizard."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Line item</Th>
                {periods.map((period) => (
                  <Th key={period.period.id} numeric>
                    {period.period.label}
                    <span className="ml-1 font-normal normal-case text-ink-muted">
                      {period.period.period_type === 'ttm' ? 'TTM' : ''}
                    </span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((key) => (
                <Tr key={key}>
                  <Td className={key === 'ebitda' || key === 'revenue' ? 'font-semibold text-ink' : 'text-ink-secondary'}>
                    {titleize(key)}
                  </Td>
                  {periods.map((period) => {
                    const item = lineItems.find((row) => row.period_id === period.period.id && row.key === key)
                    const value = period.items[key as LineItemKey]
                    return (
                      <Td key={period.period.id} numeric className={key === 'ebitda' || key === 'revenue' ? 'font-semibold' : ''}>
                        {value == null ? (
                          <span className="text-ink-muted">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {formatCurrency(value)}
                            {item && item.approved_value === null && item.proposed_value !== null ? (
                              <Badge tone="warning" title="Extracted, awaiting approval">Review</Badge>
                            ) : null}
                          </span>
                        )}
                      </Td>
                    )
                  })}
                </Tr>
              ))}

              {/* Derived rows, computed rather than stored. */}
              <Tr className="bg-surface-sunken/50">
                <Td className="font-semibold text-ink">EBITDA margin</Td>
                {periods.map((period) => {
                  const revenue = period.items.revenue
                  const ebitda = period.items.ebitda
                  const margin = revenue && ebitda ? (ebitda / revenue) * 100 : null
                  return <Td key={period.period.id} numeric className="font-semibold">{formatPercent(margin)}</Td>
                })}
              </Tr>
              <Tr className="bg-surface-sunken/50">
                <Td className="font-semibold text-ink">Agency % of labor</Td>
                {periods.map((period) => {
                  const labor = period.items.labor_expense
                  const agency = period.items.agency_labor
                  const share = labor && agency !== null && agency !== undefined ? (agency / labor) * 100 : null
                  return <Td key={period.period.id} numeric className="font-semibold">{formatPercent(share)}</Td>
                })}
              </Tr>
            </tbody>
          </Table>
        )}
      </Section>

      <Section
        title="Underwritten net operating income"
        description="Lenders underwrite an adjusted cash flow rather than reported EBITDA. These adjustments are applied consistently across every deal on the platform."
      >
        <CardBody>
          <div className="max-w-lg space-y-2">
            <div className="flex items-baseline justify-between border-b border-line pb-2 text-[13px]">
              <span className="text-ink-secondary">Reported EBITDA ({snapshot.latest?.period.label ?? 'latest period'})</span>
              <span className="tnum font-medium text-ink">{formatCurrency(snapshot.summary.ebitda)}</span>
            </div>
            {snapshot.summary.noiAdjustments.map((adjustment) => (
              <div key={adjustment.label} className="flex items-baseline justify-between border-b border-line pb-2 text-[13px]">
                <span className="text-ink-secondary">{adjustment.label}</span>
                <span className="tnum font-medium text-critical">{formatCurrency(adjustment.amount)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between pt-1 text-[13px]">
              <span className="font-semibold text-ink">Underwritten NOI</span>
              <span className="tnum font-semibold text-ink">{formatCurrency(snapshot.summary.noi)}</span>
            </div>
          </div>
        </CardBody>
      </Section>

      <Card>
        <div className="data-grid grid-cols-2 sm:grid-cols-4">
          <MetricTile label="Revenue growth" value={formatPercent(snapshot.summary.revenueGrowthPct)} />
          <MetricTile label="EBITDA growth" value={formatPercent(snapshot.summary.ebitdaGrowthPct)} />
          <MetricTile label="EBITDA margin" value={formatPercent(snapshot.summary.ebitdaMargin)} />
          <MetricTile label="EBITDAR" value={formatCurrency(snapshot.summary.ebitdar, { compact: true })} />
        </div>
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
