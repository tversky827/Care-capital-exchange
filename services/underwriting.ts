import 'server-only'
import { db } from '@/db'
import { analyzeDeal } from '@/lib/ai/local/analysis'
import { runAi } from '@/lib/ai/provider'
import { creditAnalysisSchema } from '@/lib/ai/schemas'
import { buildSnapshot, snapshotFingerprint, type DealSnapshot } from '@/lib/deal/snapshot'
import { assessReadiness, type DealReadiness } from '@/lib/underwriting/readiness'
import { scoreDeal, type DealScore } from '@/lib/underwriting/score'
import { recordAiUsage } from './ai-usage'
import { recordAudit } from './audit'
import { notify } from './notifications'
import type { Actor } from '@/lib/auth/session'
import type { CreditAnalysis, UnderwritingMetric, UnderwritingRisk, UnderwritingRun } from '@/types'

/**
 * Underwriting orchestration.
 *
 * Deterministic metrics are computed first and passed to the analyst as
 * authoritative context — the model is never asked to do arithmetic. The metric
 * rows persisted here carry their formula and their inputs, so any figure in
 * the product can be traced to the calculation that produced it.
 *
 * Runs are fingerprinted on their material inputs. Re-running an unchanged deal
 * returns the previous run instead of paying for the analysis again, which is
 * the main lever on AI spend as a deal is edited repeatedly.
 */

export interface UnderwritingResult {
  run: UnderwritingRun
  score: DealScore
  analysis: CreditAnalysis
  snapshot: DealSnapshot
  reused: boolean
}

export async function runUnderwriting(
  dealId: string,
  options: { actor?: Actor | null; force?: boolean } = {},
): Promise<UnderwritingResult> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) throw new Error('Deal not found.')

  const fingerprint = snapshotFingerprint(snapshot)

  if (!options.force) {
    const previous = await store.selectOne('underwriting_runs', {
      where: { deal_id: dealId, status: 'complete', input_fingerprint: fingerprint },
      orderBy: { field: 'created_at', dir: 'desc' },
    })
    if (previous?.analysis) {
      return {
        run: previous,
        score: {
          overall: previous.overall_score ?? 0,
          confidence: previous.confidence ?? 0.5,
          components: previous.score_components,
          coverage: Math.round((previous.confidence ?? 0.5) * 100),
        },
        analysis: previous.analysis,
        snapshot,
        reused: true,
      }
    }
  }

  const started = Date.now()
  const run = await store.insert('underwriting_runs', {
    deal_id: dealId,
    triggered_by: options.actor?.user.id ?? null,
    status: 'running',
    provider: 'pending',
    model: null,
    overall_score: null,
    confidence: null,
    score_components: [],
    analysis: null,
    input_fingerprint: fingerprint,
    error: null,
    duration_ms: 0,
    cost_usd: 0,
    completed_at: null,
  } as Omit<UnderwritingRun, 'id' | 'created_at'>)

  try {
    const score = scoreDeal(snapshot)

    const result = await runAi({
      task: 'reasoning',
      instruction:
        'Analyse this healthcare financing opportunity for a lender audience. Identify genuine strengths, the risks a credit committee will raise, the questions a lender will ask, information that is missing, and mitigants that would address each risk. Use only the computed metrics supplied; do not recompute them and do not state or imply any credit decision.',
      schema: creditAnalysisSchema,
      schemaName: 'CreditAnalysis',
      schemaHint:
        '{ overall_score: number, summary: string, strengths: string[], risks: [{title, severity, detail, category}], questions: string[], missing_information: string[], potential_mitigants: string[], lender_considerations: string[], confidence: number }',
      context: {
        deal: {
          assetType: snapshot.deal.asset_type,
          transactionType: snapshot.deal.transaction_type,
          state: snapshot.facility?.state,
        },
        computedMetrics: snapshot.summary,
        score,
        periods: snapshot.periods.map((p) => ({ label: p.period.label, items: p.items })),
        operating: snapshot.metrics,
        sponsor: snapshot.sponsor,
        openDiscrepancies: snapshot.openDiscrepancies.map((d) => ({
          title: d.title, severity: d.severity, description: d.description,
        })),
        documentsOnFile: snapshot.documents.map((d) => d.doc_type),
      },
      local: () => analyzeDeal(snapshot, score),
    })

    const analysis: CreditAnalysis = {
      overall_score: score.overall,
      summary: result.data.summary,
      strengths: result.data.strengths,
      risks: result.data.risks,
      questions: result.data.questions,
      missing_information: result.data.missing_information,
      potential_mitigants: result.data.potential_mitigants,
      lender_considerations: result.data.lender_considerations,
      confidence: result.data.confidence,
    }

    const completed = await store.update('underwriting_runs', run.id, {
      status: 'complete',
      provider: result.provider,
      model: result.model,
      overall_score: score.overall,
      confidence: score.confidence,
      score_components: score.components,
      analysis,
      error: result.fallbackReason,
      duration_ms: Date.now() - started,
      cost_usd: result.costUsd,
      completed_at: new Date().toISOString(),
    })

    await persistMetrics(run.id, dealId, snapshot)
    await persistRisks(run.id, dealId, analysis)

    await recordAiUsage({
      dealId,
      task: 'reasoning',
      provider: result.provider,
      model: result.model ?? 'local',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      success: true,
    })

    await recordAudit({
      actor: options.actor ?? null,
      action: 'underwriting.completed',
      entityType: 'underwriting_run',
      entityId: run.id,
      dealId,
      summary: `Underwriting analysis completed with a deal score of ${score.overall}.`,
      metadata: { provider: result.provider, score: score.overall, confidence: score.confidence },
    })

    await notify({
      event: 'analysis.complete',
      companyId: snapshot.deal.company_id,
      dealId,
      title: `Analysis complete for ${snapshot.deal.name}`,
      body: `Deal score ${score.overall}. ${analysis.risks.length} risk${analysis.risks.length === 1 ? '' : 's'} and ${analysis.questions.length} likely lender question${analysis.questions.length === 1 ? '' : 's'} identified.`,
      href: `/deals/${dealId}/analysis`,
    })

    return { run: completed, score, analysis, snapshot, reused: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Underwriting failed.'
    await store.update('underwriting_runs', run.id, {
      status: 'failed',
      error: message,
      duration_ms: Date.now() - started,
      completed_at: new Date().toISOString(),
    })
    throw error
  }
}

/** Persists each computed metric with the formula and inputs behind it. */
async function persistMetrics(runId: string, dealId: string, snapshot: DealSnapshot): Promise<void> {
  const store = await db()
  const s = snapshot.summary
  const rows: Omit<UnderwritingMetric, 'id' | 'created_at'>[] = [
    { run_id: runId, deal_id: dealId, key: 'ltv', label: 'Loan-to-value', value: s.ltv, unit: 'percent', formula: 'loan amount ÷ lesser of (appraised value, purchase price)', inputs: { loan: s.loanAmount, value: s.valueBasis }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'loan_to_cost', label: 'Loan-to-cost', value: s.loanToCost, unit: 'percent', formula: 'loan amount ÷ total project cost', inputs: { loan: s.loanAmount, cost: s.totalCost }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'noi', label: 'Underwritten NOI', value: s.noi, unit: 'currency', formula: 'EBITDA − imputed management fee − replacement reserve', inputs: { ebitda: s.ebitda }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'annual_debt_service', label: 'Annual debt service', value: s.annualDebtService, unit: 'currency', formula: 'level monthly payment × 12', inputs: { loan: s.loanAmount, rate: snapshot.assumedTerms.ratePct, amortization: snapshot.assumedTerms.amortizationMonths }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'dscr', label: 'Debt service coverage', value: s.dscr, unit: 'x', formula: 'underwritten NOI ÷ annual debt service', inputs: { noi: s.noi, debtService: s.annualDebtService }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'debt_yield', label: 'Debt yield', value: s.debtYield, unit: 'percent', formula: 'underwritten NOI ÷ loan amount', inputs: { noi: s.noi, loan: s.loanAmount }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'ebitda_margin', label: 'EBITDA margin', value: s.ebitdaMargin, unit: 'percent', formula: 'EBITDA ÷ revenue', inputs: { ebitda: s.ebitda, revenue: snapshot.latest?.items.revenue ?? null }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'revenue_growth', label: 'Revenue growth', value: s.revenueGrowthPct, unit: 'percent', formula: '(current − prior) ÷ prior', inputs: { current: snapshot.latest?.items.revenue ?? null, prior: snapshot.prior?.items.revenue ?? null }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'ebitda_growth', label: 'EBITDA growth', value: s.ebitdaGrowthPct, unit: 'percent', formula: '(current − prior) ÷ prior', inputs: { current: snapshot.latest?.items.ebitda ?? null, prior: snapshot.prior?.items.ebitda ?? null }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'occupancy', label: 'Occupancy', value: s.occupancyPct, unit: 'percent', formula: 'census ÷ operating beds', inputs: { census: snapshot.facility?.current_census ?? null, beds: snapshot.facility?.operating_beds ?? null }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'equity_requirement', label: 'Equity requirement', value: s.equityRequirement, unit: 'currency', formula: 'total uses − senior financing − seller financing', inputs: { uses: s.sourcesAndUses.totalUses, loan: s.loanAmount }, is_derived: true },
    { run_id: runId, deal_id: dealId, key: 'balloon_balance', label: 'Balloon balance at maturity', value: s.balloonBalance, unit: 'currency', formula: 'remaining principal after the loan term', inputs: { loan: s.loanAmount, term: snapshot.assumedTerms.termMonths }, is_derived: true },
  ]
  await store.insertMany('underwriting_metrics', rows)
}

async function persistRisks(runId: string, dealId: string, analysis: CreditAnalysis): Promise<void> {
  if (!analysis.risks.length) return
  const store = await db()
  const mitigants = analysis.potential_mitigants
  await store.insertMany(
    'underwriting_risks',
    analysis.risks.map((risk, index) => ({
      run_id: runId,
      deal_id: dealId,
      severity: risk.severity,
      category: risk.category,
      title: risk.title,
      detail: risk.detail,
      mitigant: mitigants[index] ?? null,
    })) as Omit<UnderwritingRisk, 'id' | 'created_at'>[],
  )
}

export async function latestRun(dealId: string): Promise<UnderwritingRun | null> {
  const store = await db()
  return store.selectOne('underwriting_runs', {
    where: { deal_id: dealId, status: 'complete' },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}

export async function readinessFor(dealId: string): Promise<DealReadiness | null> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) return null
  const [run, memo] = await Promise.all([
    latestRun(dealId),
    store.selectOne('credit_memos', { where: { deal_id: dealId } }),
  ])
  return assessReadiness(snapshot, { hasUnderwritingRun: Boolean(run), hasCreditMemo: Boolean(memo) })
}

export async function metricsFor(runId: string): Promise<UnderwritingMetric[]> {
  const store = await db()
  return store.select('underwriting_metrics', { where: { run_id: runId } })
}
