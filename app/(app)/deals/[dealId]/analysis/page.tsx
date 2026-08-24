import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { latestRun, metricsFor } from '@/services/underwriting'
import { scoreBand } from '@/lib/underwriting/score'
import { aiProviderIsLive } from '@/lib/ai/provider'
import {
  Alert, Badge, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { ScoreRing } from '@/components/charts'
import { InlineAction } from '@/components/forms/action-form'
import { SeverityBadge } from '@/components/deal/common'
import { runAnalysisAction } from '../../actions'
import { formatDateTime, titleize } from '@/lib/utils/format'

/**
 * AI analysis.
 *
 * The disclaimer at the head is not decoration: this page produces analysis and
 * a score, never a credit decision, and the distinction is stated where a
 * reader will see it before anything else.
 */
export default async function AnalysisPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const actor = await requireActor()

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const run = await latestRun(dealId)
  const canEdit = canEditDeal(subjectOf(actor), snapshot.deal)
  const metrics = run ? await metricsFor(run.id) : []
  const store = await db()
  const risks = run ? await store.select('underwriting_risks', { where: { run_id: run.id } }) : []
  const band = run?.overall_score != null ? scoreBand(run.overall_score) : null
  const analysis = run?.analysis

  if (!run || !analysis) {
    return (
      <Card>
        <EmptyState
          title="No underwriting analysis yet"
          description="The analysis reads the deal's computed metrics, operating history, payer mix and sponsor profile, and produces the strengths, risks and questions a credit committee will raise."
          action={
            canEdit ? (
              <InlineAction
                action={runAnalysisAction}
                label="Run underwriting analysis"
                hidden={{ dealId }}
                variant="primary"
                size="md"
                pendingLabel="Analysing…"
              />
            ) : null
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Alert tone="neutral" title="This is analysis, not a credit decision">
        CareCapital Exchange does not lend, approve credit or commit to any financing. What follows is
        decision support prepared from the information on this deal, for the borrower and for lenders
        conducting their own underwriting.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <Section
            title="Deal score"
            description={`Generated ${formatDateTime(run.completed_at ?? run.created_at)} by ${run.provider === 'local-analyst' ? 'the built-in deterministic analyst' : `${run.provider}${run.model ? ` (${run.model})` : ''}`}.`}
            actions={
              canEdit ? (
                <InlineAction action={runAnalysisAction} label="Re-run" hidden={{ dealId }} pendingLabel="Analysing…" />
              ) : null
            }
          >
            <CardBody>
              <ScoreRing
                score={run.overall_score ?? 0}
                size={112}
                tone={band?.tone === 'strong' ? 'positive' : band?.tone === 'weak' ? 'critical' : band?.tone === 'watch' ? 'warning' : 'accent'}
                label={band?.label}
                sublabel={`Confidence ${Math.round((run.confidence ?? 0) * 100)}% — the share of expected underwriting inputs actually available.`}
              />

              <div className="mt-5 space-y-3">
                {run.score_components.map((component) => (
                  <div key={component.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">
                        {component.label}
                        <span className="ml-1.5 font-normal text-ink-muted">{Math.round(component.weight * 100)}% weight</span>
                      </span>
                      <span className="tnum text-[13px] font-semibold text-ink">{component.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={component.data_quality === 'missing' ? 'h-full bg-line-strong' : component.data_quality === 'partial' ? 'h-full bg-accent/60' : 'h-full bg-accent'}
                        style={{ width: `${component.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                      {component.rationale}
                      {component.data_quality !== 'complete' ? (
                        <Badge tone="warning" className="ml-1.5">{titleize(component.data_quality)} data</Badge>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Section>

          {!aiProviderIsLive() ? (
            <Alert tone="neutral" title="Running without a model provider">
              No AI provider is configured, so the deterministic analyst produced this analysis from
              the deal&apos;s computed metrics. Set <code className="font-mono">AI_PROVIDER</code> and{' '}
              <code className="font-mono">OPENAI_API_KEY</code> to route the same request to a model —
              the output is validated against the identical schema either way.
            </Alert>
          ) : null}
        </div>

        <div className="space-y-4">
          <Section title="Summary">
            <CardBody>
              <p className="text-[13px] leading-relaxed text-ink-secondary">{analysis.summary}</p>
            </CardBody>
          </Section>

          {analysis.strengths.length > 0 ? (
            <Section title={`Strengths (${analysis.strengths.length})`}>
              <ul className="divide-y divide-line">
                {analysis.strengths.map((strength) => (
                  <li key={strength} className="px-4 py-2.5 text-[13px] leading-relaxed text-ink-secondary">
                    {strength}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {analysis.risks.length > 0 ? (
            <Section title={`Risks (${analysis.risks.length})`} description="What a credit committee is likely to raise.">
              <ul className="divide-y divide-line">
                {analysis.risks.map((risk, index) => {
                  const stored = risks[index]
                  return (
                    <li key={`${risk.title}-${index}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={risk.severity} />
                        <Badge tone="neutral">{risk.category}</Badge>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold text-ink">{risk.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{risk.detail}</p>
                      {stored?.mitigant ? (
                        <p className="mt-2 border-l-2 border-positive/40 pl-3 text-[12px] leading-relaxed text-ink-secondary">
                          <span className="font-medium text-positive">Mitigant. </span>
                          {stored.mitigant}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Section>
          ) : null}

          {analysis.questions.length > 0 ? (
            <Section title={`Questions lenders will ask (${analysis.questions.length})`} description="Answering these in the package removes a round trip with every lender.">
              <ol className="divide-y divide-line">
                {analysis.questions.map((question, index) => (
                  <li key={question} className="flex gap-3 px-4 py-2.5">
                    <span className="tnum shrink-0 text-[12px] font-semibold text-ink-muted">{index + 1}</span>
                    <span className="text-[13px] leading-relaxed text-ink-secondary">{question}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {analysis.missing_information.length > 0 ? (
            <Section title="Missing information" description="Absent inputs, reported rather than estimated.">
              <ul className="divide-y divide-line">
                {analysis.missing_information.map((item) => (
                  <li key={item} className="px-4 py-2.5 text-[13px] leading-relaxed text-ink-secondary">{item}</li>
                ))}
              </ul>
            </Section>
          ) : null}

          {analysis.lender_considerations.length > 0 ? (
            <Section title="Lender selection considerations">
              <ul className="divide-y divide-line">
                {analysis.lender_considerations.map((item) => (
                  <li key={item} className="px-4 py-2.5 text-[13px] leading-relaxed text-ink-secondary">{item}</li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>

      <Section
        title="Computed metrics"
        description="Every figure here is produced by a tested function in application code. The formula and its inputs are recorded with each value."
      >
        <Table>
          <thead>
            <tr><Th>Metric</Th><Th numeric>Value</Th><Th>Formula</Th><Th>Inputs</Th></tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <Tr key={metric.id}>
                <Td className="font-medium text-ink">{metric.label}</Td>
                <Td numeric>
                  {metric.value === null ? (
                    <span className="text-ink-muted">Not computable</span>
                  ) : metric.unit === 'currency' ? (
                    `$${metric.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  ) : metric.unit === 'percent' ? (
                    `${metric.value.toFixed(2)}%`
                  ) : metric.unit === 'x' ? (
                    `${metric.value.toFixed(2)}x`
                  ) : (
                    metric.value.toLocaleString()
                  )}
                </Td>
                <Td className="font-mono text-[11px] text-ink-secondary">{metric.formula}</Td>
                <Td className="text-[11px] text-ink-muted">
                  {Object.entries(metric.inputs)
                    .map(([key, value]) => `${key}=${value === null ? '—' : Number(value).toLocaleString()}`)
                    .join('  ')}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Link href={`/deals/${dealId}/memo`} className="text-[13px] text-accent hover:underline">
          Generate the credit memo from this analysis →
        </Link>
        <Link href={`/deals/${dealId}/ask`} className="text-[13px] text-accent hover:underline">
          Ask a question about this deal →
        </Link>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
