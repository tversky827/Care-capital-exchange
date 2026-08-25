import { z } from 'zod'

/**
 * Every AI response is validated against one of these schemas before it is
 * allowed anywhere near the database. A model that returns prose, an extra
 * field, or a number where null was required fails validation and the run is
 * recorded as failed rather than silently writing bad data onto a deal.
 */

export const confidenceSchema = z.number().min(0).max(1)

/** A single extracted datum. `normalized_value` is null when not numeric. */
export const extractedFieldSchema = z.object({
  field_name: z.string().min(1).max(120),
  value: z.string().nullable(),
  normalized_value: z.number().nullable(),
  unit: z.string().nullable(),
  year: z.number().int().min(1900).max(2200).nullable(),
  period: z.string().nullable(),
  page_number: z.number().int().min(1).nullable(),
  source_text: z.string().max(2000).nullable(),
  confidence: confidenceSchema,
})
export type ExtractedFieldPayload = z.infer<typeof extractedFieldSchema>

export const extractionResultSchema = z.object({
  document_kind: z.string(),
  fields: z.array(extractedFieldSchema).max(400),
  /** Facts the document was expected to contain but does not. */
  not_found: z.array(z.string()).max(50).default([]),
  notes: z.string().max(2000).nullable().default(null),
})
export type ExtractionResult = z.infer<typeof extractionResultSchema>

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info'])

export const analysisRiskSchema = z.object({
  title: z.string().min(1).max(200),
  severity: severitySchema,
  detail: z.string().min(1).max(2000),
  category: z.string().max(60),
})

/**
 * Credit analysis output. Note the absence of any approval field — the platform
 * never renders a credit decision, only analysis a lender can act on.
 */
export const creditAnalysisSchema = z.object({
  overall_score: z.number().min(0).max(100),
  summary: z.string().min(1).max(4000),
  strengths: z.array(z.string().max(600)).max(20),
  risks: z.array(analysisRiskSchema).max(30),
  questions: z.array(z.string().max(600)).max(30),
  missing_information: z.array(z.string().max(300)).max(30),
  potential_mitigants: z.array(z.string().max(600)).max(20),
  lender_considerations: z.array(z.string().max(600)).max(20),
  confidence: confidenceSchema,
})
export type CreditAnalysisPayload = z.infer<typeof creditAnalysisSchema>

export const discrepancyFindingSchema = z.object({
  detector_key: z.string().max(120),
  category: z.enum([
    'revenue', 'ebitda', 'debt', 'ownership', 'census', 'occupancy', 'payer_mix', 'dates',
    'missing_document', 'unexpected_change', 'other',
  ]),
  severity: severitySchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  ai_explanation: z.string().max(2000).nullable(),
  suggested_question: z.string().max(600).nullable(),
  document_ids: z.array(z.string()).max(10),
  conflicting_values: z
    .array(z.object({ label: z.string().max(120), value: z.string().max(120), source: z.string().max(200) }))
    .max(10),
})
export type DiscrepancyFinding = z.infer<typeof discrepancyFindingSchema>

export const reconciliationResultSchema = z.object({
  findings: z.array(discrepancyFindingSchema).max(60),
})
export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>

export const memoSectionSchema = z.object({
  key: z.string().max(60),
  title: z.string().max(200),
  body: z.string().max(20000),
  citations: z
    .array(
      z.object({
        marker: z.string().max(20),
        label: z.string().max(300),
        document_id: z.string().nullable(),
        page: z.number().int().min(1).nullable(),
        value: z.string().max(200).nullable(),
      }),
    )
    .max(60),
})

export const creditMemoSchema = z.object({ sections: z.array(memoSectionSchema).max(30) })
export type CreditMemoPayload = z.infer<typeof creditMemoSchema>

export const matchExplanationSchema = z.object({
  headline: z.string().max(300),
  narrative: z.string().max(2000),
  concerns: z.array(z.string().max(400)).max(10),
})
export type MatchExplanationPayload = z.infer<typeof matchExplanationSchema>

export const dealChatAnswerSchema = z.object({
  answer: z.string().min(1).max(6000),
  citations: z
    .array(
      z.object({
        document_id: z.string().nullable(),
        label: z.string().max(300),
        page: z.number().int().min(1).nullable(),
        quote: z.string().max(600).nullable(),
      }),
    )
    .max(20),
  /** True when the deal record simply does not contain the answer. */
  insufficient_information: z.boolean(),
})
export type DealChatAnswer = z.infer<typeof dealChatAnswerSchema>

export const dataRequestListSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().max(200),
        detail: z.string().max(600).nullable(),
        doc_type: z.string().max(60),
        importance: z.enum(['required', 'recommended', 'optional']),
      }),
    )
    .max(40),
})
export type DataRequestList = z.infer<typeof dataRequestListSchema>

// ---------------------------------------------------------------------------
// Equity marketplace
// ---------------------------------------------------------------------------

/**
 * An investment analysis of an offering.
 *
 * Shaped so that a model cannot return a number the product would then quote:
 * every figure an investor sees comes from the deterministic engines, and this
 * schema carries only the qualitative reading around them.
 */
export const investmentAnalysisSchema = z.object({
  thesis: z.string().max(2000),
  strengths: z.array(z.string().max(400)).max(20),
  risks: z.array(analysisRiskSchema).max(30),
  key_assumptions: z.array(z.string().max(400)).max(20),
  questions_to_ask: z.array(z.string().max(400)).max(20),
  missing_information: z.array(z.string().max(400)).max(20),
  downside_considerations: z.array(z.string().max(400)).max(20),
  confidence: confidenceSchema,
})

export type InvestmentAnalysisPayload = z.infer<typeof investmentAnalysisSchema>

/** A narrative bear case. The arithmetic beside it is computed, never generated. */
export const bearCaseSchema = z.object({
  narrative: z.string().max(2000),
  drivers: z.array(z.object({
    label: z.string().max(120),
    detail: z.string().max(600),
  })).max(12),
  what_would_have_to_be_true: z.array(z.string().max(400)).max(12),
})

export type BearCasePayload = z.infer<typeof bearCaseSchema>

/** A quarterly update drafted for a human to approve before investors see it. */
export const investorUpdateSchema = z.object({
  title: z.string().max(200),
  body: z.string().max(6000),
  highlights: z.array(z.string().max(300)).max(10),
})

export type InvestorUpdatePayload = z.infer<typeof investorUpdateSchema>
