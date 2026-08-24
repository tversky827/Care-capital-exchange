import 'server-only'
import { db } from '@/db'
import { extractFields } from '@/lib/ai/local/extract'
import { extractionResultSchema, type ExtractedFieldPayload } from '@/lib/ai/schemas'
import { runAi } from '@/lib/ai/provider'
import { parseDocument, type ParsedDocument } from '@/lib/documents/parse'
import { getMalwareScanner } from './malware'
import { getOcrService } from './ocr'
import { getStorage } from './storage'
import { recordAudit } from './audit'
import { notify } from './notifications'
import { recordAiUsage } from './ai-usage'
import type {
  DocumentRecord, ExtractedField, ExtractionMethod, FinancialLineItem, FinancialPeriod, LineItemKey,
} from '@/types'
import { LINE_ITEM_KEYS } from '@/types'

/**
 * The document processing pipeline.
 *
 *   scan → parse → OCR (if needed) → extract → validate → persist → project
 *
 * Each stage updates `processing_status` on the document, so the data room
 * shows real progress rather than a spinner. A stage that fails records the
 * reason on the document and on the job, and the job is retryable.
 *
 * The final stage projects extracted values onto the deal's financial records
 * as *proposals*. Approved figures are never overwritten — see
 * `projectOntoDeal` for why that rule is load-bearing.
 */

const EXPECTED_BY_DOC_TYPE: Partial<Record<DocumentRecord['doc_type'], string[]>> = {
  profit_and_loss: ['revenue', 'ebitda', 'labor_expense', 'agency_labor', 'rent', 'net_income'],
  balance_sheet: ['existing_debt'],
  census: ['occupancy_pct', 'average_census', 'licensed_beds', 'patient_days'],
  payer_mix: ['medicare_pct', 'medicaid_pct', 'private_pay_pct', 'managed_care_pct'],
  tax_return: ['revenue', 'net_income'],
  appraisal: ['appraised_value'],
  purchase_agreement: ['purchase_price'],
  loi: ['purchase_price'],
  existing_debt: ['existing_debt'],
}

export interface ProcessResult {
  documentId: string
  status: DocumentRecord['processing_status']
  fieldsExtracted: number
  runId: string | null
}

export async function processDocument(documentId: string): Promise<ProcessResult> {
  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error(`Document ${documentId} not found.`)

  const fail = async (status: DocumentRecord['processing_status'], note: string): Promise<ProcessResult> => {
    await store.update('documents', documentId, {
      processing_status: status,
      extraction_status: status === 'needs_ocr' ? 'pending' : 'failed',
      notes: note,
    })
    await notify({
      event: status === 'needs_ocr' ? 'document.uploaded' : 'document.failed',
      companyId: document.company_id,
      dealId: document.deal_id,
      title: `${document.display_name} could not be processed`,
      body: note,
      href: `/deals/${document.deal_id}/documents`,
    })
    return { documentId, status, fieldsExtracted: 0, runId: null }
  }

  // --- 1. Malware scan ----------------------------------------------------
  await store.update('documents', documentId, { processing_status: 'scanning' })
  const bytes = await getStorage().get(document.storage_key)
  const scan = await getMalwareScanner().scan(document.filename, bytes)
  if (scan.verdict === 'infected') {
    await store.update('documents', documentId, {
      malware_scan: 'infected',
      processing_status: 'quarantined',
      extraction_status: 'not_applicable',
      notes: scan.detail,
    })
    await recordAudit({
      actor: null,
      action: 'document.quarantined',
      entityType: 'document',
      entityId: documentId,
      dealId: document.deal_id,
      summary: `${document.display_name} was quarantined by the ${scan.scanner} scanner.`,
      metadata: { detail: scan.detail },
    })
    return { documentId, status: 'quarantined', fieldsExtracted: 0, runId: null }
  }
  await store.update('documents', documentId, { malware_scan: 'clean' })

  // --- 2. Parse -----------------------------------------------------------
  await store.update('documents', documentId, { processing_status: 'parsing' })
  let parsed: ParsedDocument
  try {
    parsed = parseDocument(document.filename, document.mime_type, bytes)
  } catch (error) {
    return fail('failed', `Could not read the file: ${error instanceof Error ? error.message : 'unknown error'}.`)
  }

  let method: ExtractionMethod = parsed.tables.length ? 'structured_parse' : 'text_pattern'

  // --- 3. OCR when there is no text layer ---------------------------------
  if (parsed.needsOcr) {
    const ocr = getOcrService()
    if (!ocr.available) {
      return fail(
        'needs_ocr',
        'This document has no machine-readable text layer. Configure an OCR service, or upload a text-based version, to extract data from it.',
      )
    }
    const result = await ocr.recognize(document.filename, bytes, document.mime_type)
    parsed = { ...parsed, text: result.pages.map((p) => p.text).join('\n'), needsOcr: false }
    method = 'ocr_llm'
  }

  if (!parsed.text.trim() && !parsed.tables.length) {
    return fail('failed', 'No readable content was found in this document.')
  }

  // --- 4. Extract ---------------------------------------------------------
  await store.update('documents', documentId, { processing_status: 'extracting', extraction_status: 'running' })

  const expected = EXPECTED_BY_DOC_TYPE[document.doc_type] ?? []
  const result = await runAi({
    task: 'extraction',
    instruction:
      'Extract every financial, operating and transaction figure present in the supplied document. Return one entry per figure per period. Return null for any value not stated in the document; do not infer, estimate or carry a figure across periods.',
    schema: extractionResultSchema,
    schemaName: 'ExtractionResult',
    schemaHint:
      '{ document_kind: string, fields: [{ field_name, value, normalized_value, unit, year, period, page_number, source_text, confidence }], not_found: string[], notes: string|null }',
    context: {
      documentType: document.doc_type,
      documentName: document.display_name,
      expectedFields: expected,
      knownFieldNames: [...LINE_ITEM_KEYS, 'occupancy_pct', 'medicaid_pct', 'medicare_pct', 'private_pay_pct', 'managed_care_pct', 'average_census', 'licensed_beds', 'purchase_price', 'appraised_value', 'existing_debt'],
    },
    documents: [{ id: document.id, label: document.display_name, content: `${parsed.text}\n\n${parsed.tables.map((t) => `${t.name}\n${t.rows.map((r) => r.join(' | ')).join('\n')}`).join('\n\n')}` }],
    local: () => extractFields({ parsed, documentLabel: document.display_name, expectedFields: expected }),
  })

  // --- 5. Persist ---------------------------------------------------------
  const run = await store.insert('extraction_runs', {
    deal_id: document.deal_id,
    document_id: documentId,
    status: 'complete',
    method,
    model: result.model,
    provider: result.provider,
    fields_extracted: result.data.fields.length,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    error: result.fallbackReason,
    raw_response: {
      not_found: result.data.not_found,
      notes: result.data.notes,
      injection_findings: result.injectionFindings,
      warnings: parsed.warnings,
    },
    completed_at: new Date().toISOString(),
  })

  await recordAiUsage({
    dealId: document.deal_id,
    task: 'extraction',
    provider: result.provider,
    model: result.model ?? 'local',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    success: true,
  })

  if (result.data.fields.length) {
    await store.insertMany(
      'extracted_fields',
      result.data.fields.map((field) => toExtractedFieldRow(field, document, run.id, method)),
    )
  }

  await store.update('documents', documentId, {
    processing_status: 'processed',
    extraction_status: 'complete',
    page_count: parsed.pageCount,
    notes: result.injectionFindings.length
      ? `Suspicious instruction-like content was detected in this document and ignored: ${result.injectionFindings.join(', ')}.`
      : parsed.warnings.join(' ') || null,
  })

  // --- 6. Project onto the deal ------------------------------------------
  await projectOntoDeal(document, result.data.fields)

  await recordAudit({
    actor: null,
    action: 'document.extracted',
    entityType: 'document',
    entityId: documentId,
    dealId: document.deal_id,
    summary: `Extracted ${result.data.fields.length} fields from ${document.display_name} using ${result.provider}.`,
    metadata: { runId: run.id, method, provider: result.provider, injectionFindings: result.injectionFindings },
  })

  await notify({
    event: 'document.processed',
    companyId: document.company_id,
    dealId: document.deal_id,
    title: `${document.display_name} processed`,
    body: `${result.data.fields.length} data point${result.data.fields.length === 1 ? '' : 's'} extracted. Values are marked for your review before they become the official deal figures.`,
    href: `/deals/${document.deal_id}/financials`,
  })

  return { documentId, status: 'processed', fieldsExtracted: result.data.fields.length, runId: run.id }
}

/**
 * Finds the financial period an extracted figure belongs to.
 *
 * Matches on the period label first (so a `TTM 2026-07` column lands on the
 * TTM period rather than on a fabricated 2026 fiscal year), then on fiscal
 * year for a plain annual column, and only creates a period when the label is
 * unambiguously an annual one.
 */
async function resolvePeriod(
  dealId: string,
  field: ExtractedFieldPayload,
  known: FinancialPeriod[],
): Promise<FinancialPeriod | null> {
  const label = field.period?.trim()
  if (label) {
    const byLabel = known.find((p) => p.label.toLowerCase() === label.toLowerCase())
    if (byLabel) return byLabel
  }

  const isAnnualLabel = !label || /^(FY\s*)?(19|20)\d{2}(\s*(A|E|Actual))?$/i.test(label)
  if (field.year === null || !isAnnualLabel) {
    // Non-annual labels (TTM, YTD, budget) only project onto a period that
    // already exists under that exact label.
    return null
  }

  const byYear = known.find((p) => p.fiscal_year === field.year && p.period_type === 'annual')
  if (byYear) return byYear

  const store = await db()
  const created = await store.insert('financial_periods', {
    deal_id: dealId,
    label: String(field.year),
    period_type: 'annual',
    fiscal_year: field.year,
    start_date: `${field.year}-01-01`,
    end_date: `${field.year}-12-31`,
    source: 'extracted',
    is_primary: false,
  } as Omit<FinancialPeriod, 'id' | 'created_at'>)
  known.push(created)
  return created
}

function toExtractedFieldRow(
  field: ExtractedFieldPayload,
  document: DocumentRecord,
  runId: string,
  method: ExtractionMethod,
): Omit<ExtractedField, 'id' | 'created_at'> {
  return {
    deal_id: document.deal_id,
    run_id: runId,
    document_id: document.id,
    field_name: field.field_name,
    value: field.value,
    normalized_value: field.normalized_value,
    unit: field.unit,
    year: field.year,
    period: field.period,
    page_number: field.page_number,
    source_text: field.source_text,
    confidence: field.confidence,
    extraction_method: method,
    review_status: 'unreviewed',
    reviewed_by: null,
    reviewed_at: null,
  }
}

/**
 * Projects extracted values onto the deal's financial records.
 *
 * The rule that governs this function: **an approved figure is never
 * overwritten**. Extraction proposes; a person approves. When extraction finds
 * a value that contradicts one a human already approved, it records the
 * proposal alongside the approved figure and leaves reconciliation to raise the
 * conflict — because silently replacing a number a borrower signed off on is
 * how a platform loses a lender's trust permanently.
 */
async function projectOntoDeal(document: DocumentRecord, fields: ExtractedFieldPayload[]): Promise<void> {
  const store = await db()
  const dealId = document.deal_id
  const lineItemKeys = new Set<string>(LINE_ITEM_KEYS)

  // --- Financial line items, grouped by the period they were reported for --
  const existingPeriods = await store.select('financial_periods', { where: { deal_id: dealId } })

  const byPeriodKey = new Map<string, ExtractedFieldPayload[]>()
  for (const field of fields) {
    if (!lineItemKeys.has(field.field_name) || field.normalized_value === null) continue
    if (field.year === null && !field.period) continue
    const key = `${field.period ?? ''}|${field.year ?? ''}`
    const list = byPeriodKey.get(key) ?? []
    list.push(field)
    byPeriodKey.set(key, list)
  }

  for (const yearFields of byPeriodKey.values()) {
    const sample = yearFields[0]!
    const period = await resolvePeriod(dealId, sample, existingPeriods)
    // A figure reported for a period we cannot place — a trailing-twelve-month
    // column with no matching period on the deal, say — stays recorded as an
    // extracted field but is not projected onto the financials. Inventing a
    // period for it would silently change what the deal's numbers mean.
    if (!period) continue

    const existingItems = await store.select('financial_line_items', {
      where: { deal_id: dealId, period_id: period.id },
    })

    for (const field of yearFields) {
      const key = field.field_name as LineItemKey
      const existing = existingItems.find((item) => item.key === key)
      const value = field.normalized_value!

      if (!existing) {
        await store.insert('financial_line_items', {
          period_id: period.id,
          deal_id: dealId,
          key,
          label: key,
          // Usable immediately, but flagged for review until approved.
          value,
          proposed_value: value,
          approved_value: null,
          approved_by: null,
          approved_at: null,
          source_document_id: document.id,
          source_page: field.page_number,
          confidence: field.confidence,
        } as Omit<FinancialLineItem, 'id' | 'created_at' | 'updated_at'>)
        continue
      }

      if (existing.approved_value !== null) {
        // Approved figure stands. Record the proposal so reconciliation can
        // raise the conflict, and leave the deal figure untouched.
        if (existing.approved_value !== value) {
          await store.update('financial_line_items', existing.id, {
            proposed_value: value,
            confidence: field.confidence,
          })
        }
        continue
      }

      // Unapproved: take the higher-confidence source.
      if ((existing.confidence ?? 0) <= field.confidence) {
        await store.update('financial_line_items', existing.id, {
          value,
          proposed_value: value,
          source_document_id: document.id,
          source_page: field.page_number,
          confidence: field.confidence,
        })
      }
    }
  }

  // --- Operating and payer metrics ---------------------------------------
  const metricFields = [
    'occupancy_pct', 'average_census', 'medicare_pct', 'medicaid_pct',
    'private_pay_pct', 'managed_care_pct', 'other_payer_pct',
    'average_daily_rate', 'revenue_per_patient_day', 'labor_hours_per_patient_day',
  ] as const
  const metricValues: Partial<Record<(typeof metricFields)[number], number>> = {}
  let metricYear: number | null = null
  for (const field of fields) {
    if (!(metricFields as readonly string[]).includes(field.field_name)) continue
    if (field.normalized_value === null) continue
    const key = field.field_name as (typeof metricFields)[number]
    if (metricValues[key] === undefined) {
      metricValues[key] = field.normalized_value
      metricYear ??= field.year
    }
  }

  if (Object.keys(metricValues).length) {
    const facility = await store.selectOne('facilities', { where: { deal_id: dealId } })
    if (facility) {
      const periodLabel = metricYear ? String(metricYear) : 'Extracted'
      const existing = await store.selectOne('facility_metrics', {
        where: { deal_id: dealId, period_label: periodLabel },
      })
      const payload = {
        occupancy_pct: metricValues.occupancy_pct ?? null,
        average_census: metricValues.average_census ?? null,
        medicare_pct: metricValues.medicare_pct ?? null,
        medicaid_pct: metricValues.medicaid_pct ?? null,
        private_pay_pct: metricValues.private_pay_pct ?? null,
        managed_care_pct: metricValues.managed_care_pct ?? null,
        other_payer_pct: metricValues.other_payer_pct ?? null,
        average_daily_rate: metricValues.average_daily_rate ?? null,
        revenue_per_patient_day: metricValues.revenue_per_patient_day ?? null,
        labor_hours_per_patient_day: metricValues.labor_hours_per_patient_day ?? null,
      }
      if (existing) {
        // Only fill gaps; never clear a value a person entered.
        const patch = Object.fromEntries(
          Object.entries(payload).filter(([key, value]) => value !== null && existing[key as keyof typeof existing] === null),
        )
        if (Object.keys(patch).length) await store.update('facility_metrics', existing.id, patch)
      } else {
        await store.insert('facility_metrics', {
          facility_id: facility.id,
          deal_id: dealId,
          period_label: periodLabel,
          period_end: metricYear ? `${metricYear}-12-31` : new Date().toISOString().slice(0, 10),
          ...payload,
          agency_labor_pct: null,
        } as never)
      }
    }
  }

  // --- Transaction terms, gaps only --------------------------------------
  const termsMap: Record<string, 'purchase_price' | 'appraised_value' | 'existing_debt' | 'seller_financing'> = {
    purchase_price: 'purchase_price',
    appraised_value: 'appraised_value',
    existing_debt: 'existing_debt',
    seller_financing: 'seller_financing',
  }
  const terms = await store.selectOne('transaction_terms', { where: { deal_id: dealId } })
  if (terms) {
    const patch: Record<string, number> = {}
    for (const field of fields) {
      const column = termsMap[field.field_name]
      if (!column || field.normalized_value === null) continue
      if (terms[column] === null && patch[column] === undefined) patch[column] = field.normalized_value
    }
    if (Object.keys(patch).length) await store.update('transaction_terms', terms.id, patch)
  }
}

export async function extractedFieldsForDeal(dealId: string): Promise<ExtractedField[]> {
  const store = await db()
  return store.select('extracted_fields', {
    where: { deal_id: dealId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}
