import { describe, expect, it } from 'vitest'
import { detectKind, parseDelimitedRows, parseDocument } from '@/lib/documents/parse'
import { extractFields, normalizeValue } from '@/lib/ai/local/extract'
import { parseFinancialNumber, parsePeriodLabel } from '@/lib/ai/local/numbers'
import { matchLabel } from '@/lib/ai/local/vocabulary'
import { extractionResultSchema } from '@/lib/ai/schemas'
import { buildZip } from './helpers/zip'

describe('delimited parsing', () => {
  it('handles quoted fields with embedded delimiters and escaped quotes', () => {
    const rows = parseDelimitedRows('a,"b,c","say ""hi"""\n1,2,3')
    expect(rows[0]).toEqual(['a', 'b,c', 'say "hi"'])
    expect(rows[1]).toEqual(['1', '2', '3'])
  })

  it('drops blank rows', () => {
    expect(parseDelimitedRows('a,b\n\n\nc,d')).toHaveLength(2)
  })
})

describe('financial number parsing', () => {
  it('reads currency, separators and multipliers', () => {
    expect(parseFinancialNumber('$18,400,000')).toMatchObject({ value: 18_400_000, unit: 'usd' })
    expect(parseFinancialNumber('18.4M')).toMatchObject({ value: 18_400_000, unit: 'usd' })
    expect(parseFinancialNumber('750K')).toMatchObject({ value: 750_000, unit: 'usd' })
  })

  it('reads accounting parentheses as negative', () => {
    expect(parseFinancialNumber('(1,200,000)')?.value).toBe(-1_200_000)
  })

  it('reads percentages', () => {
    expect(parseFinancialNumber('87.4%')).toMatchObject({ value: 87.4, unit: 'percent' })
  })

  it('refuses to read a bare year as a measurement', () => {
    expect(parseFinancialNumber('2025')).toBeNull()
  })

  it('returns null for non-numeric text', () => {
    expect(parseFinancialNumber('Total Revenue')).toBeNull()
    expect(parseFinancialNumber('')).toBeNull()
  })
})

describe('period labels', () => {
  it('recognises fiscal years, TTM and projections', () => {
    expect(parsePeriodLabel('2025')).toMatchObject({ year: 2025, type: 'annual' })
    expect(parsePeriodLabel('FY2024')).toMatchObject({ year: 2024, type: 'annual' })
    expect(parsePeriodLabel('TTM 9/30/2025')).toMatchObject({ type: 'ttm' })
    expect(parsePeriodLabel('2026 Budget')).toMatchObject({ type: 'projection' })
    expect(parsePeriodLabel('Notes')).toBeNull()
  })
})

describe('label vocabulary', () => {
  it('prefers the more specific label', () => {
    expect(matchLabel('Agency Labor')?.field).toBe('agency_labor')
    expect(matchLabel('Total Salaries & Benefits')?.field).toBe('labor_expense')
    expect(matchLabel('EBITDAR')?.field).toBe('ebitdar')
    expect(matchLabel('Adjusted EBITDA')?.field).toBe('ebitda')
  })

  it('ignores labels it does not recognise', () => {
    expect(matchLabel('Miscellaneous line 47')).toBeNull()
  })
})

describe('extraction from a period-column P&L', () => {
  const csv = [
    'Lakeview Skilled Nursing Center — Statement of Operations',
    'Line Item,2023,2024,2025',
    'Total Revenue,"$16,900,000","$17,200,000","$18,400,000"',
    'Total Salaries & Benefits,"$9,100,000","$9,600,000","$10,050,000"',
    'Agency Labor,"$1,240,000","$980,000","$610,000"',
    'Rent,"$0","$0","$0"',
    'EBITDA,"$2,180,000","$2,450,000","$2,710,000"',
    'Occupancy,86.1%,85.4%,87.0%',
  ].join('\n')

  const parsed = parseDocument('pl-2025.csv', 'text/csv', Buffer.from(csv))
  const result = extractFields({ parsed, documentLabel: '2025 P&L' })

  it('validates against the extraction schema', () => {
    expect(() => extractionResultSchema.parse(result)).not.toThrow()
  })

  it('emits one field per line item per period', () => {
    const revenue = result.fields.filter((f) => f.field_name === 'revenue')
    expect(revenue).toHaveLength(3)
    expect(revenue.find((f) => f.year === 2025)?.normalized_value).toBe(18_400_000)
    expect(revenue.find((f) => f.year === 2023)?.normalized_value).toBe(16_900_000)
  })

  it('distinguishes agency labor from total labor', () => {
    const agency = result.fields.find((f) => f.field_name === 'agency_labor' && f.year === 2025)
    const labor = result.fields.find((f) => f.field_name === 'labor_expense' && f.year === 2025)
    expect(agency?.normalized_value).toBe(610_000)
    expect(labor?.normalized_value).toBe(10_050_000)
  })

  it('assigns high confidence to structured table cells', () => {
    expect(result.fields.every((f) => f.confidence >= 0.9)).toBe(true)
  })

  it('carries source text for every field so a value can be traced back', () => {
    expect(result.fields.every((f) => (f.source_text?.length ?? 0) > 0)).toBe(true)
  })

  it('reports expected fields that the document does not contain', () => {
    const withExpectations = extractFields({
      parsed, documentLabel: '2025 P&L', expectedFields: ['revenue', 'capex', 'medicaid_pct'],
    })
    expect(withExpectations.not_found).toContain('capex')
    expect(withExpectations.not_found).toContain('medicaid_pct')
    expect(withExpectations.not_found).not.toContain('revenue')
  })

  it('never invents a value for a line item that is absent', () => {
    expect(result.fields.some((f) => f.field_name === 'capex')).toBe(false)
  })
})

describe('extraction from free text', () => {
  const text = [
    'FY2025 OPERATING SUMMARY',
    'Total Revenue ......... $18,400,000',
    'EBITDA ................ $2,710,000',
    'Occupancy ............. 87.0%',
    'Narrative commentary that contains no figures at all.',
  ].join('\n')

  it('extracts labelled figures at a lower confidence than table cells', () => {
    const parsed = parseDocument('summary.txt', 'text/plain', Buffer.from(text))
    const result = extractFields({ parsed, documentLabel: 'Summary' })
    const revenue = result.fields.find((f) => f.field_name === 'revenue')
    expect(revenue?.normalized_value).toBe(18_400_000)
    expect(revenue?.year).toBe(2025)
    expect(revenue!.confidence).toBeLessThan(0.9)
  })
})

describe('unit normalization', () => {
  it('treats a bare fraction as a proportion for percentage fields', () => {
    expect(normalizeValue(0.62, 'count', 'percent')).toBe(62)
  })

  it('leaves an explicit percentage alone', () => {
    expect(normalizeValue(62, 'percent', 'percent')).toBe(62)
  })

  it('does not rescale currency', () => {
    expect(normalizeValue(0.5, 'usd', 'usd')).toBe(0.5)
  })
})

describe('Office container parsing', () => {
  it('reads cells and shared strings out of an XLSX workbook', () => {
    const xlsx = buildZip({
      '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
      'xl/workbook.xml': '<?xml version="1.0"?><workbook><sheets><sheet name="Census" sheetId="1"/></sheets></workbook>',
      'xl/sharedStrings.xml':
        '<?xml version="1.0"?><sst count="3"><si><t>Line Item</t></si><si><t>2025</t></si><si><t>Total Revenue</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<?xml version="1.0"?><worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>18400000</v></c></row>' +
        '</sheetData></worksheet>',
    })

    expect(detectKind('book.xlsx', 'application/octet-stream', xlsx)).toBe('xlsx')
    const parsed = parseDocument('book.xlsx', 'application/octet-stream', xlsx)
    expect(parsed.tables[0]?.name).toBe('Census')
    expect(parsed.tables[0]?.rows[1]).toEqual(['Total Revenue', '18400000'])

    const result = extractFields({ parsed, documentLabel: 'Workbook' })
    expect(result.fields.find((f) => f.field_name === 'revenue')?.normalized_value).toBe(18_400_000)
  })

  it('reads paragraphs and tables out of a DOCX document', () => {
    const docx = buildZip({
      'word/document.xml':
        '<?xml version="1.0"?><w:document><w:body>' +
        '<w:p><w:r><w:t>Purchase Price: </w:t></w:r><w:r><w:t>$14,000,000</w:t></w:r></w:p>' +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>EBITDA</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t>$2,710,000</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
        '</w:body></w:document>',
    })

    const parsed = parseDocument('loi.docx', 'application/octet-stream', docx)
    expect(parsed.text).toContain('Purchase Price: $14,000,000')
    expect(parsed.tables[0]?.rows[0]).toEqual(['EBITDA', '$2,710,000'])

    const result = extractFields({ parsed, documentLabel: 'LOI' })
    expect(result.fields.find((f) => f.field_name === 'ebitda')?.normalized_value).toBe(2_710_000)
  })

  it('routes an image to OCR rather than recording an empty extraction', () => {
    const parsed = parseDocument('scan.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(parsed.needsOcr).toBe(true)
    expect(parsed.warnings.length).toBeGreaterThan(0)
  })

  it('flags a PDF with no text layer as needing OCR', () => {
    const parsed = parseDocument('scan.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%%EOF'))
    expect(parsed.kind).toBe('pdf')
    expect(parsed.needsOcr).toBe(true)
  })
})
