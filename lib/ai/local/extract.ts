import type { ExtractedFieldPayload, ExtractionResult } from '@/lib/ai/schemas'
import type { ParsedDocument, ParsedTable } from '@/lib/documents/parse'
import { firstNumberInRow, parseFinancialNumber, parsePeriodLabel } from './numbers'
import { matchLabel, type FieldPattern } from './vocabulary'

/**
 * Deterministic financial extraction.
 *
 * Reads a parsed document and produces the same `ExtractedField` shape a model
 * would, with honest confidence. The rules, in order of preference:
 *
 *  1. A table whose header row names fiscal periods yields one field per
 *     (line item, period) cell. This is the highest-confidence path because
 *     both the label and the period are explicit in the file.
 *  2. A table with no period header yields one field per labelled row.
 *  3. Free text yields fields from `Label .... $value` patterns.
 *
 * Nothing is inferred. A figure that cannot be tied to a recognised label is
 * not emitted, and a label with no figure is reported in `not_found` rather
 * than being given a placeholder value.
 */

export interface ExtractionInput {
  parsed: ParsedDocument
  documentLabel: string
  /** Restricts the vocabulary when the document type is already known. */
  patterns?: FieldPattern[]
  /** Percent fields extracted from a payer-mix document, etc. */
  expectedFields?: string[]
}

const MAX_FIELDS = 400

export function extractFields(input: ExtractionInput): ExtractionResult {
  const fields: ExtractedFieldPayload[] = []
  const seen = new Set<string>()

  const push = (field: ExtractedFieldPayload) => {
    const key = `${field.field_name}|${field.year ?? ''}|${field.period ?? ''}`
    if (seen.has(key) || fields.length >= MAX_FIELDS) return
    seen.add(key)
    fields.push(field)
  }

  for (const table of input.parsed.tables) {
    for (const field of extractFromTable(table, input.patterns)) push(field)
  }
  if (input.parsed.text) {
    for (const field of extractFromText(input.parsed.text, input.patterns)) push(field)
  }

  const found = new Set(fields.map((f) => f.field_name))
  const notFound = (input.expectedFields ?? []).filter((name) => !found.has(name))

  return {
    document_kind: input.parsed.kind,
    fields,
    not_found: notFound,
    notes: input.parsed.warnings.length ? input.parsed.warnings.join(' ') : null,
  }
}

/** Locates the header row that names fiscal periods, if the table has one. */
function findPeriodHeader(rows: string[][]): { rowIndex: number; periods: Map<number, { label: string; year: number | null }> } | null {
  const limit = Math.min(rows.length, 8)
  for (let r = 0; r < limit; r++) {
    const row = rows[r]!
    const periods = new Map<number, { label: string; year: number | null }>()
    for (let c = 1; c < row.length; c++) {
      const parsed = parsePeriodLabel(row[c] ?? '')
      if (parsed) periods.set(c, { label: parsed.label, year: parsed.year })
    }
    if (periods.size >= 1 && periods.size >= row.slice(1).filter((c) => c.trim()).length * 0.5) {
      return { rowIndex: r, periods }
    }
  }
  return null
}

function extractFromTable(table: ParsedTable, patterns?: FieldPattern[]): ExtractedFieldPayload[] {
  const out: ExtractedFieldPayload[] = []
  const header = findPeriodHeader(table.rows)

  for (let r = 0; r < table.rows.length; r++) {
    if (header && r <= header.rowIndex) continue
    const row = table.rows[r]!
    const label = (row[0] ?? '').trim()
    if (!label) continue
    const pattern = matchLabel(label, patterns)
    if (!pattern) continue

    if (header) {
      for (const [columnIndex, period] of header.periods) {
        const cell = row[columnIndex]
        if (!cell?.trim()) continue
        const parsed = parseFinancialNumber(cell)
        if (!parsed) continue
        out.push({
          field_name: pattern.field,
          value: cell.trim(),
          normalized_value: normalizeValue(parsed.value, parsed.unit, pattern.unit),
          unit: pattern.unit,
          year: period.year,
          period: period.label,
          page_number: null,
          source_text: `${label}: ${cell.trim()} (${period.label}, ${table.name})`,
          confidence: Math.min(pattern.maxConfidence ?? 0.95, 0.95),
        })
      }
    } else {
      const found = firstNumberInRow(row, 1)
      if (!found) continue
      out.push({
        field_name: pattern.field,
        value: found.value.raw,
        normalized_value: normalizeValue(found.value.value, found.value.unit, pattern.unit),
        unit: pattern.unit,
        year: null,
        period: null,
        page_number: null,
        source_text: `${label}: ${found.value.raw} (${table.name})`,
        confidence: Math.min(pattern.maxConfidence ?? 0.88, 0.88),
      })
    }
  }
  return out
}

const TEXT_LINE = /^\s*([A-Za-z][A-Za-z0-9 &/'().,-]{2,60}?)\s*[:.\s]{2,}\s*(\(?-?\$?[\d,]+(?:\.\d+)?\)?%?[KkMmBb]{0,2})\s*$/

function extractFromText(text: string, patterns?: FieldPattern[]): ExtractedFieldPayload[] {
  const out: ExtractedFieldPayload[] = []
  const lines = text.split('\n')
  // Track the most recent fiscal-year heading so a figure below it inherits it.
  let currentYear: number | null = null

  for (const line of lines) {
    const heading = line.match(/\b(?:FY\s*)?((?:19|20)\d{2})\b/)
    if (heading && line.trim().length < 40) currentYear = Number(heading[1])

    const match = line.match(TEXT_LINE)
    if (!match) continue
    const label = match[1]!.trim()
    const rawValue = match[2]!.trim()
    const pattern = matchLabel(label, patterns)
    if (!pattern) continue
    const parsed = parseFinancialNumber(rawValue)
    if (!parsed) continue

    out.push({
      field_name: pattern.field,
      value: rawValue,
      normalized_value: normalizeValue(parsed.value, parsed.unit, pattern.unit),
      unit: pattern.unit,
      year: currentYear,
      period: currentYear ? String(currentYear) : null,
      page_number: null,
      source_text: line.trim().slice(0, 500),
      // Text extraction is less certain than a table cell: the label and value
      // are only adjacent, not structurally related.
      confidence: Math.min(pattern.maxConfidence ?? 0.78, 0.78),
    })
  }
  return out
}

/**
 * Reconciles the unit written in the file against the unit the field expects.
 *
 * A percentage field carrying `0.62` means 62%, and a percentage field carrying
 * `62%` also means 62%. Getting this wrong by a factor of 100 in an underwriting
 * metric is exactly the class of error this normalisation exists to prevent.
 */
export function normalizeValue(
  value: number,
  sourceUnit: 'usd' | 'percent' | 'count' | 'ratio',
  targetUnit: 'usd' | 'percent' | 'count' | 'ratio',
): number {
  if (targetUnit === 'percent') {
    if (sourceUnit === 'percent') return round2(value)
    // A bare fraction between 0 and 1 is a proportion, not a percentage.
    return round2(value > 0 && value <= 1 ? value * 100 : value)
  }
  return round2(value)
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Confidence bands used throughout the UI. */
export function confidenceBand(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high'
  if (confidence >= 0.7) return 'medium'
  return 'low'
}
