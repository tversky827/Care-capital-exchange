import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { usageSummary } from '@/services/ai-usage'
import { aiProviderIsLive } from '@/lib/ai/provider'
import { Alert, Badge, Card, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { MetricTile } from '@/components/deal/common'
import { FlagControl } from './flag-control'
import { confidenceBand } from '@/lib/ai/local/extract'
import { formatCurrency, formatDateTime, formatPercent, formatRelative, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'AI review' }

/**
 * AI review.
 *
 * Everything the AI layer produced, with its provider, model, cost, and — most
 * importantly — its confidence and any fallback. A run whose model output
 * failed schema validation is shown as such rather than being indistinguishable
 * from a clean one.
 */
export default async function AdminAiPage() {
  await requireAdmin()
  const store = await db()

  const [usage, extractionRuns, underwritingRuns, lowConfidence, documents, deals] = await Promise.all([
    usageSummary(),
    store.select('extraction_runs', { orderBy: { field: 'created_at', dir: 'desc' }, limit: 40 }),
    store.select('underwriting_runs', { orderBy: { field: 'created_at', dir: 'desc' }, limit: 20 }),
    store.select('extracted_fields', { where: { confidence: { lt: 0.7 } }, limit: 60 }),
    store.select('documents', {}),
    store.select('deals', {}),
  ])

  const documentName = new Map(documents.map((document) => [document.id, document.display_name]))
  const dealRef = new Map(deals.map((deal) => [deal.id, deal.reference]))
  const withFallback = [...extractionRuns, ...underwritingRuns].filter((run) => run.error)
  const withInjection = extractionRuns.filter(
    (run) => ((run.raw_response as { injection_findings?: string[] } | null)?.injection_findings?.length ?? 0) > 0,
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="AI review"
        description="Every model call the platform has made, what it cost, and where output needed a fallback."
      />

      {!aiProviderIsLive() ? (
        <Alert tone="neutral" title="No model provider is configured">
          Every AI-assisted operation is running on its deterministic local implementation. The output
          is validated against the same schemas either way, and the provider column below reflects
          which path each run took.
        </Alert>
      ) : null}

      {withInjection.length > 0 ? (
        <Alert tone="warning" title={`${withInjection.length} document(s) contained instruction-like content`}>
          Uploaded documents are treated as untrusted data and fenced inside a per-call delimiter. The
          content below was detected and ignored rather than acted on, and is surfaced here so it can
          be investigated.
          <ul className="mt-2 space-y-1">
            {withInjection.slice(0, 5).map((run) => (
              <li key={run.id}>
                · {run.document_id ? documentName.get(run.document_id) ?? 'Document' : 'Document'} —{' '}
                {((run.raw_response as { injection_findings?: string[] }).injection_findings ?? []).join(', ')}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-4">
          <MetricTile
            label="Spend, month to date"
            value={formatCurrency(usage.monthToDateUsd, { decimals: 2 })}
            detail={`${usage.budgetUsedPct}% of ${formatCurrency(usage.budgetUsd)}`}
            tone={usage.budgetUsedPct > 90 ? 'critical' : usage.budgetUsedPct > 70 ? 'warning' : undefined}
          />
          <MetricTile label="Calls" value={usage.callCount} />
          <MetricTile label="Extraction runs" value={extractionRuns.length} />
          <MetricTile
            label="Fallbacks"
            value={withFallback.length}
            tone={withFallback.length > 0 ? 'warning' : undefined}
            detail="Model output that failed validation"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Spend by task">
          <Table>
            <thead><tr><Th>Task</Th><Th numeric>Calls</Th><Th numeric>Tokens</Th><Th numeric>Cost</Th></tr></thead>
            <tbody>
              {usage.byTask.map((row) => (
                <Tr key={row.task}>
                  <Td className="font-medium text-ink">{titleize(row.task)}</Td>
                  <Td numeric>{row.calls}</Td>
                  <Td numeric>{row.tokens.toLocaleString()}</Td>
                  <Td numeric>{formatCurrency(row.costUsd, { decimals: 4 })}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Spend by provider">
          <Table>
            <thead><tr><Th>Provider</Th><Th numeric>Calls</Th><Th numeric>Cost</Th></tr></thead>
            <tbody>
              {usage.byProvider.map((row) => (
                <Tr key={row.provider}>
                  <Td className="font-medium text-ink">{row.provider}</Td>
                  <Td numeric>{row.calls}</Td>
                  <Td numeric>{formatCurrency(row.costUsd, { decimals: 4 })}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>

      {lowConfidence.length > 0 ? (
        <Section
          title={`Low-confidence extractions (${lowConfidence.length})`}
          description="Fields extracted below 70% confidence. These require human review before they become a deal's figure."
        >
          <Table>
            <thead>
              <tr><Th>Deal</Th><Th>Field</Th><Th numeric>Value</Th><Th>Period</Th><Th>Confidence</Th><Th>Source</Th><Th>Review</Th></tr>
            </thead>
            <tbody>
              {lowConfidence.slice(0, 30).map((field) => (
                <Tr key={field.id}>
                  <Td>
                    <Link href={`/deals/${field.deal_id}/financials`} className="text-accent hover:underline">
                      {dealRef.get(field.deal_id) ?? 'Deal'}
                    </Link>
                  </Td>
                  <Td className="font-medium text-ink">{titleize(field.field_name)}</Td>
                  <Td numeric>{field.value ?? '—'}</Td>
                  <Td className="text-ink-secondary">{field.period ?? field.year ?? '—'}</Td>
                  <Td>
                    <Badge tone="critical">{formatPercent(field.confidence * 100, 0)}</Badge>
                  </Td>
                  <Td className="max-w-48 truncate text-[11px] text-ink-muted">
                    {field.document_id ? documentName.get(field.document_id) ?? '—' : 'Manual'}
                  </Td>
                  <Td><Badge tone="neutral">{titleize(field.review_status)}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      <Section title="Recent extraction runs">
        <Table>
          <thead>
            <tr>
              <Th>When</Th><Th>Deal</Th><Th>Document</Th><Th>Method</Th><Th>Provider</Th>
              <Th numeric>Fields</Th><Th numeric>Duration</Th><Th numeric>Cost</Th><Th>Notes</Th><Th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {extractionRuns.map((run) => (
              <Tr key={run.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatRelative(run.created_at)}</Td>
                <Td>
                  <Link href={`/deals/${run.deal_id}/financials`} className="text-accent hover:underline">
                    {dealRef.get(run.deal_id) ?? 'Deal'}
                  </Link>
                </Td>
                <Td className="max-w-48 truncate text-ink-secondary">
                  {run.document_id ? documentName.get(run.document_id) ?? '—' : '—'}
                </Td>
                <Td><Badge tone="neutral">{titleize(run.method)}</Badge></Td>
                <Td className="text-[12px] text-ink-secondary">{run.provider}{run.model ? ` · ${run.model}` : ''}</Td>
                <Td numeric>{run.fields_extracted}</Td>
                <Td numeric className="text-ink-muted">{run.duration_ms}ms</Td>
                <Td numeric>{run.cost_usd ? formatCurrency(run.cost_usd, { decimals: 4 }) : '—'}</Td>
                <Td className="max-w-64 text-[11px] text-warning">{run.error ?? ''}</Td>
                <Td><FlagControl runId={run.id} kind="extraction_run" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section title="Recent underwriting runs">
        <Table>
          <thead>
            <tr><Th>When</Th><Th>Deal</Th><Th>Provider</Th><Th numeric>Score</Th><Th numeric>Confidence</Th><Th>Status</Th><Th>Notes</Th><Th className="w-40" /></tr>
          </thead>
          <tbody>
            {underwritingRuns.map((run) => (
              <Tr key={run.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(run.created_at)}</Td>
                <Td>
                  <Link href={`/deals/${run.deal_id}/analysis`} className="text-accent hover:underline">
                    {dealRef.get(run.deal_id) ?? 'Deal'}
                  </Link>
                </Td>
                <Td className="text-[12px] text-ink-secondary">{run.provider}{run.model ? ` · ${run.model}` : ''}</Td>
                <Td numeric>{run.overall_score ?? '—'}</Td>
                <Td numeric>{run.confidence !== null ? formatPercent(run.confidence * 100, 0) : '—'}</Td>
                <Td>
                  <Badge tone={run.status === 'complete' ? 'positive' : run.status === 'failed' ? 'critical' : 'neutral'}>
                    {titleize(run.status)}
                  </Badge>
                </Td>
                <Td className="max-w-64 text-[11px] text-warning">{run.error ?? ''}</Td>
                <Td><FlagControl runId={run.id} kind="underwriting_run" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Card>
        <CardBody>
          <p className="eyebrow mb-2">Confidence bands</p>
          <ul className="space-y-1 text-[12px] text-ink-secondary">
            <li>· <Badge tone="positive">High</Badge> ≥ 90% — structured table cell with an explicit label and period.</li>
            <li>· <Badge tone="warning">Medium</Badge> 70–89% — labelled row without an explicit period, or a strong text match.</li>
            <li>· <Badge tone="critical">Low</Badge> &lt; 70% — {confidenceBand(0.5)} confidence; requires review before it becomes a deal figure.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
