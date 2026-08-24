import 'server-only'
import { db } from '@/db'
import { answerDealQuestion } from '@/lib/ai/local/chat'
import { runAi } from '@/lib/ai/provider'
import { dealChatAnswerSchema, type DealChatAnswer } from '@/lib/ai/schemas'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { recordAiUsage } from './ai-usage'
import { latestRun } from './underwriting'

/**
 * "Ask the Deal".
 *
 * Answers are grounded in the deal's own records: the model receives computed
 * metrics and extracted values as trusted context and document excerpts as
 * untrusted data, and the schema requires it to declare when the record does
 * not contain the answer.
 */

export const SUGGESTED_QUESTIONS = [
  'What caused EBITDA to change year over year?',
  'What are the three biggest risks on this deal?',
  'Which documents support the revenue number?',
  'Show me all debt obligations.',
  'What information is still missing?',
  'What would a lender probably question?',
] as const

export async function askDeal(dealId: string, question: string): Promise<DealChatAnswer> {
  const store = await db()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) throw new Error('Deal not found.')

  const [extracted, documents, run] = await Promise.all([
    store.select('extracted_fields', { where: { deal_id: dealId } }),
    store.select('documents', { where: { deal_id: dealId, deleted_at: { isNull: true } } }),
    latestRun(dealId),
  ])

  const context = { snapshot, extracted, documents, analysis: run?.analysis ?? null }

  const result = await runAi({
    task: 'chat',
    instruction: `Answer the user's question about this financing opportunity using only the supplied deal record. Cite the document behind any figure you state. If the record does not contain the answer, set insufficient_information to true and say so plainly rather than estimating.\n\nUser question: ${question.slice(0, 1000)}`,
    schema: dealChatAnswerSchema,
    schemaName: 'DealChatAnswer',
    schemaHint: '{ answer: string, citations: [{document_id, label, page, quote}], insufficient_information: boolean }',
    context: {
      computed: snapshot.summary,
      periods: snapshot.periods.map((p) => ({ label: p.period.label, items: p.items })),
      facility: snapshot.facility,
      operating: snapshot.metrics,
      sponsor: snapshot.sponsor,
      analysis: run?.analysis ?? null,
      documents: documents.map((d) => ({ id: d.id, name: d.display_name, type: d.doc_type })),
      extractedFields: extracted.slice(0, 200).map((f) => ({
        field: f.field_name, year: f.year, value: f.normalized_value,
        document_id: f.document_id, page: f.page_number, confidence: f.confidence,
      })),
    },
    local: () => answerDealQuestion(question, context),
  })

  await recordAiUsage({
    dealId,
    task: 'chat',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  return result.data
}
