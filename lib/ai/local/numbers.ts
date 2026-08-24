/** Number recognition for financial documents. */

export interface ParsedNumber {
  value: number
  unit: 'usd' | 'percent' | 'count' | 'ratio'
  raw: string
}

const MULTIPLIERS: Record<string, number> = { k: 1_000, m: 1_000_000, mm: 1_000_000, b: 1_000_000_000 }

/**
 * Parses a financial figure, honouring the conventions statements actually use:
 * currency symbols, thousands separators, accounting parentheses for negatives,
 * trailing K/M/MM/B multipliers and percent signs.
 */
export function parseFinancialNumber(input: string): ParsedNumber | null {
  const raw = input.trim()
  if (!raw) return null
  // A bare year is not a measurement.
  if (/^(19|20)\d{2}$/.test(raw)) return null

  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-')
  const isPercent = raw.includes('%')
  const isCurrency = raw.includes('$')

  const cleaned = raw.replace(/[()$,%\s]/g, '').replace(/^-/, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(kK|mm|MM|[kKmMbB])?$/)
  if (!match) return null

  let value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const suffix = match[2]?.toLowerCase()
  if (suffix && MULTIPLIERS[suffix]) value *= MULTIPLIERS[suffix]
  if (negative) value = -value

  const unit: ParsedNumber['unit'] = isPercent ? 'percent' : isCurrency || suffix ? 'usd' : 'count'
  return { value, unit, raw }
}

/** Finds the first parseable figure in a row of cells, scanning right to left. */
export function firstNumberInRow(cells: string[], fromIndex = 0): { value: ParsedNumber; index: number } | null {
  for (let i = fromIndex; i < cells.length; i++) {
    const parsed = parseFinancialNumber(cells[i] ?? '')
    if (parsed) return { value: parsed, index: i }
  }
  return null
}

/** Recognises a fiscal period label: `2025`, `FY2024`, `TTM`, `TTM 9/30/25`. */
export function parsePeriodLabel(input: string): { label: string; year: number | null; type: string } | null {
  const raw = input.trim()
  if (!raw) return null
  const ttm = /\bTTM\b/i.test(raw)
  const yearMatch = raw.match(/(19|20)\d{2}/)
  const year = yearMatch ? Number(yearMatch[0]) : null
  if (ttm) return { label: raw, year, type: 'ttm' }
  if (/\bYTD\b/i.test(raw)) return { label: raw, year, type: 'ytd' }
  if (/\b(budget|proforma|pro forma|project)/i.test(raw)) return { label: raw, year, type: 'projection' }
  if (year && /^(FY\s*)?(19|20)\d{2}(\s*(A|E|P|Actual|Budget))?$/i.test(raw)) {
    return { label: raw, year, type: 'annual' }
  }
  if (year) return { label: raw, year, type: 'annual' }
  return null
}
