/**
 * Line-item vocabulary.
 *
 * Maps the labels that actually appear on healthcare operating statements onto
 * the platform's canonical field names. Order matters: the first matching
 * pattern wins, so more specific labels are listed before their generic
 * cousins (`agency labor` before `labor`, `total revenue` before `revenue`).
 */

export interface FieldPattern {
  field: string
  label: string
  unit: 'usd' | 'percent' | 'count' | 'ratio'
  patterns: RegExp[]
  /** Confidence ceiling for this label — some labels are inherently ambiguous. */
  maxConfidence?: number
}

export const FINANCIAL_PATTERNS: FieldPattern[] = [
  { field: 'agency_labor', label: 'Agency labor', unit: 'usd', patterns: [/\bagency\s+(labor|labour|staffing|nursing)\b/i, /\bcontract\s+labor\b/i] },
  { field: 'labor_expense', label: 'Labor expense', unit: 'usd', patterns: [/\btotal\s+(labor|salaries|payroll)\b/i, /\b(salaries|wages)\s*(&|and)\s*benefits\b/i, /\bnursing\s+labor\b/i, /^labor(\s+expense)?$/i] },
  { field: 'ebitdar', label: 'EBITDAR', unit: 'usd', patterns: [/\bEBITDAR\b/i] },
  { field: 'ebitda', label: 'EBITDA', unit: 'usd', patterns: [/\bEBITDA\b/i, /\badjusted\s+EBITDA\b/i] },
  { field: 'noi', label: 'Net operating income', unit: 'usd', patterns: [/\bnet\s+operating\s+income\b/i, /\bNOI\b/] },
  { field: 'net_income', label: 'Net income', unit: 'usd', patterns: [/\bnet\s+(income|profit|loss)\b/i] },
  { field: 'revenue', label: 'Revenue', unit: 'usd', patterns: [/\btotal\s+(net\s+)?(revenue|revenues|patient\s+revenue)\b/i, /\bnet\s+patient\s+(service\s+)?revenue\b/i, /^revenue[s]?$/i, /\bgross\s+revenue\b/i] },
  { field: 'rent', label: 'Rent', unit: 'usd', patterns: [/\b(rent|lease)\s+expense\b/i, /^rent$/i, /\bfacility\s+rent\b/i] },
  { field: 'utilities', label: 'Utilities', unit: 'usd', patterns: [/\butilit(y|ies)\b/i] },
  { field: 'insurance', label: 'Insurance', unit: 'usd', patterns: [/\binsurance\b/i, /\bgeneral\s*(&|and)\s*professional\s+liability\b/i] },
  { field: 'taxes', label: 'Taxes', unit: 'usd', patterns: [/\b(real\s+estate|property)\s+tax(es)?\b/i, /^taxes$/i] },
  { field: 'capex', label: 'Capital expenditures', unit: 'usd', patterns: [/\bcapital\s+expenditures?\b/i, /\bcap\s?ex\b/i] },
  { field: 'management_fee', label: 'Management fee', unit: 'usd', patterns: [/\bmanagement\s+fee[s]?\b/i] },
  { field: 'interest_expense', label: 'Interest expense', unit: 'usd', patterns: [/\binterest\s+expense\b/i] },
  { field: 'depreciation', label: 'Depreciation', unit: 'usd', patterns: [/\bdepreciation(\s*(&|and)\s*amortization)?\b/i] },
  { field: 'total_operating_expense', label: 'Total operating expense', unit: 'usd', patterns: [/\btotal\s+(operating\s+)?expense[s]?\b/i] },
]

export const OPERATING_PATTERNS: FieldPattern[] = [
  { field: 'occupancy_pct', label: 'Occupancy', unit: 'percent', patterns: [/\boccupancy\b/i] },
  { field: 'average_census', label: 'Average census', unit: 'count', patterns: [/\b(average\s+)?(daily\s+)?census\b/i, /\bADC\b/] },
  { field: 'licensed_beds', label: 'Licensed beds', unit: 'count', patterns: [/\blicensed\s+beds\b/i] },
  { field: 'certified_beds', label: 'Certified beds', unit: 'count', patterns: [/\bcertified\s+beds\b/i] },
  { field: 'operating_beds', label: 'Operating beds', unit: 'count', patterns: [/\b(operating|available|in\s?service)\s+beds\b/i, /^beds$/i] },
  { field: 'patient_days', label: 'Patient days', unit: 'count', patterns: [/\bpatient\s+days\b/i] },
  { field: 'average_daily_rate', label: 'Average daily rate', unit: 'usd', patterns: [/\baverage\s+daily\s+rate\b/i, /\bADR\b/] },
  { field: 'revenue_per_patient_day', label: 'Revenue per patient day', unit: 'usd', patterns: [/\brevenue\s+per\s+patient\s+day\b/i, /\bRPPD\b/] },
  { field: 'labor_hours_per_patient_day', label: 'Labor hours per patient day', unit: 'ratio', patterns: [/\b(labor\s+)?hours\s+per\s+patient\s+day\b/i, /\bHPPD\b/, /\bPPD\s+hours\b/i] },
]

export const PAYER_PATTERNS: FieldPattern[] = [
  { field: 'medicare_pct', label: 'Medicare mix', unit: 'percent', patterns: [/\bmedicare\b/i] },
  { field: 'medicaid_pct', label: 'Medicaid mix', unit: 'percent', patterns: [/\bmedicaid\b/i] },
  { field: 'managed_care_pct', label: 'Managed care mix', unit: 'percent', patterns: [/\bmanaged\s+care\b/i, /\bMCO\b/, /\bmedicare\s+advantage\b/i] },
  { field: 'private_pay_pct', label: 'Private pay mix', unit: 'percent', patterns: [/\bprivate\s*(pay)?\b/i, /\bself\s*pay\b/i] },
  { field: 'other_payer_pct', label: 'Other payer mix', unit: 'percent', patterns: [/\bother\s*(payer|payor)?\b/i, /\bVA\b/, /\bhospice\b/i] },
]

export const TRANSACTION_PATTERNS: FieldPattern[] = [
  { field: 'purchase_price', label: 'Purchase price', unit: 'usd', patterns: [/\bpurchase\s+price\b/i, /\btotal\s+consideration\b/i] },
  { field: 'appraised_value', label: 'Appraised value', unit: 'usd', patterns: [/\b(appraised|as[-\s]?is)\s+value\b/i, /\bmarket\s+value\b/i, /\bvalue\s+conclusion\b/i] },
  { field: 'existing_debt', label: 'Existing debt', unit: 'usd', patterns: [/\b(outstanding|existing|current)\s+(principal|balance|debt|loan)\b/i, /\bpayoff\s+amount\b/i, /\bunpaid\s+principal\s+balance\b/i] },
  { field: 'seller_financing', label: 'Seller financing', unit: 'usd', patterns: [/\bseller\s+(financing|note|carry)\b/i] },
  { field: 'earnest_money', label: 'Earnest money', unit: 'usd', patterns: [/\bearnest\s+money\b/i, /\bdeposit\b/i] },
]

export const ALL_PATTERNS = [
  ...FINANCIAL_PATTERNS,
  ...OPERATING_PATTERNS,
  ...PAYER_PATTERNS,
  ...TRANSACTION_PATTERNS,
]

export function matchLabel(label: string, patterns: FieldPattern[] = ALL_PATTERNS): FieldPattern | null {
  const cleaned = label.replace(/[.:_]+$/g, '').replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length > 80) return null
  for (const candidate of patterns) {
    if (candidate.patterns.some((p) => p.test(cleaned))) return candidate
  }
  return null
}
