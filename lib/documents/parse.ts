import { inflateSync } from 'node:zlib'
import { attr, collectTagText, decodeXmlEntities, stripTags } from './xml'
import { extractZipEntry, isZipContainer, readZipEntries, readZipFile } from './zip'

/**
 * Document parsing.
 *
 * Turns an uploaded file into text plus, where the format carries structure,
 * tables. Structured formats (CSV, XLSX) yield real cells, which is what makes
 * high-confidence extraction possible without a model; unstructured formats
 * fall back to text, and a scanned PDF with no text layer is routed to OCR
 * rather than being silently treated as empty.
 */

export interface ParsedTable {
  name: string
  rows: string[][]
}

export interface ParsedDocument {
  kind: 'csv' | 'xlsx' | 'docx' | 'pdf' | 'text' | 'image' | 'unknown'
  text: string
  tables: ParsedTable[]
  pageCount: number | null
  /** Set when the file carries no machine-readable text and needs OCR. */
  needsOcr: boolean
  warnings: string[]
}

export function detectKind(filename: string, mimeType: string, buffer: Buffer): ParsedDocument['kind'] {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'tsv' || mimeType === 'text/csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx'
  if (ext === 'docx') return 'docx'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'].includes(ext) || mimeType.startsWith('image/')) return 'image'
  if (['txt', 'md', 'json'].includes(ext) || mimeType.startsWith('text/')) return 'text'
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  if (isZipContainer(buffer)) {
    const entries = readZipEntries(buffer)
    if (entries.has('xl/workbook.xml')) return 'xlsx'
    if (entries.has('word/document.xml')) return 'docx'
  }
  return 'unknown'
}

export function parseDocument(filename: string, mimeType: string, buffer: Buffer): ParsedDocument {
  const kind = detectKind(filename, mimeType, buffer)
  switch (kind) {
    case 'csv':
      return parseDelimited(buffer, filename)
    case 'xlsx':
      return parseXlsx(buffer)
    case 'docx':
      return parseDocx(buffer)
    case 'pdf':
      return parsePdf(buffer)
    case 'text':
      return { kind, text: buffer.toString('utf8'), tables: [], pageCount: null, needsOcr: false, warnings: [] }
    case 'image':
      return {
        kind, text: '', tables: [], pageCount: 1, needsOcr: true,
        warnings: ['Image file has no text layer; OCR is required.'],
      }
    default:
      return {
        kind: 'unknown', text: '', tables: [], pageCount: null, needsOcr: false,
        warnings: [`Unsupported file type for ${filename}.`],
      }
  }
}

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

/** RFC 4180 splitter: handles quoted fields, embedded delimiters and "" escapes. */
export function parseDelimitedRows(input: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0))
}

function parseDelimited(buffer: Buffer, filename: string): ParsedDocument {
  const raw = buffer.toString('utf8')
  const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ','
  const rows = parseDelimitedRows(raw, delimiter)
  return {
    kind: 'csv',
    text: rows.map((r) => r.join(' | ')).join('\n'),
    tables: [{ name: filename, rows }],
    pageCount: null,
    needsOcr: false,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A'
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function parseXlsx(buffer: Buffer): ParsedDocument {
  const warnings: string[] = []
  const entries = readZipEntries(buffer)
  if (!entries.size) {
    return { kind: 'xlsx', text: '', tables: [], pageCount: null, needsOcr: false, warnings: ['Workbook could not be opened.'] }
  }

  // Shared strings are stored once and referenced by index from each cell.
  const sharedBuffer = extractZipEntry(buffer, 'xl/sharedStrings.xml')
  const shared: string[] = sharedBuffer
    ? collectTagText(sharedBuffer.toString('utf8'), 'si')
    : []

  const sheetNames = new Map<string, string>()
  const workbook = extractZipEntry(buffer, 'xl/workbook.xml')?.toString('utf8')
  if (workbook) {
    let index = 1
    for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
      const name = attr(match[0], 'name')
      if (name) sheetNames.set(`sheet${index}`, name)
      index++
    }
  }

  const tables: ParsedTable[] = []
  const sheetEntries = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()

  for (const sheetPath of sheetEntries) {
    const data = readZipFile(buffer, entries.get(sheetPath)!)
    if (!data) {
      warnings.push(`Worksheet ${sheetPath} could not be decompressed.`)
      continue
    }
    const xml = data.toString('utf8')
    const rows: string[][] = []
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const meta = cellMatch[1] ?? ''
        const body = cellMatch[2] ?? ''
        const reference = attr(meta, 'r') ?? ''
        const type = attr(meta, 't')
        let value: string
        if (type === 's') {
          const index = Number(stripTags(body).trim())
          value = shared[index] ?? ''
        } else if (type === 'inlineStr') {
          value = decodeXmlEntities(stripTags(body))
        } else {
          const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
          value = decodeXmlEntities(stripTags(raw))
        }
        const target = reference ? columnIndex(reference) : cells.length
        while (cells.length < target) cells.push('')
        cells.push(value.trim())
      }
      if (cells.some((c) => c.length)) rows.push(cells)
    }
    const key = sheetPath.replace('xl/worksheets/', '').replace('.xml', '')
    if (rows.length) tables.push({ name: sheetNames.get(key) ?? key, rows })
  }

  const text = tables
    .map((table) => `# ${table.name}\n${table.rows.map((r) => r.join(' | ')).join('\n')}`)
    .join('\n\n')
  return { kind: 'xlsx', text, tables, pageCount: tables.length, needsOcr: false, warnings }
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

function parseDocx(buffer: Buffer): ParsedDocument {
  const data = extractZipEntry(buffer, 'word/document.xml')
  if (!data) {
    return { kind: 'docx', text: '', tables: [], pageCount: null, needsOcr: false, warnings: ['Document body could not be read.'] }
  }
  const xml = data.toString('utf8')
  const paragraphs: string[] = []
  for (const match of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const runs = collectTagText(match[1] ?? '', 'w:t')
    const line = runs.join('').trim()
    if (line) paragraphs.push(line)
  }

  const tables: ParsedTable[] = []
  let tableIndex = 1
  for (const tableMatch of xml.matchAll(/<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g)) {
    const rows: string[][] = []
    for (const rowMatch of (tableMatch[1] ?? '').matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
      const cells: string[] = []
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)) {
        cells.push(collectTagText(cellMatch[1] ?? '', 'w:t').join('').trim())
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) tables.push({ name: `Table ${tableIndex++}`, rows })
  }

  return { kind: 'docx', text: paragraphs.join('\n'), tables, pageCount: null, needsOcr: false, warnings: [] }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function decodePdfString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (char !== '\\') {
      out += char
      continue
    }
    const next = raw[++i]
    if (next === undefined) break
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next >= '0' && next <= '7') {
      let octal = next
      while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') octal += raw[++i]
      out += String.fromCharCode(parseInt(octal, 8))
    } else out += next
  }
  return out
}

/**
 * Extracts the text layer from a PDF.
 *
 * Walks content streams for text-showing operators (Tj, TJ, ', ") rather than
 * fully interpreting PDF graphics. That is enough for the machine-generated
 * statements this product receives; a scanned document produces no text and is
 * reported as `needsOcr` so the pipeline routes it to the OCR service instead
 * of recording an empty extraction as a success.
 */
function parsePdf(buffer: Buffer): ParsedDocument {
  const warnings: string[] = []
  const latin = buffer.toString('latin1')
  const pageCount = (latin.match(/\/Type\s*\/Page[^s]/g) ?? []).length || null

  const chunks: string[] = []
  const streamPattern = /stream\r?\n?([\s\S]*?)endstream/g
  for (const match of latin.matchAll(streamPattern)) {
    const raw = Buffer.from(match[1] ?? '', 'latin1')
    let content: string | null = null
    try {
      content = inflateSync(raw).toString('latin1')
    } catch {
      // Uncompressed content streams are legal and common in generated PDFs.
      content = /\bTJ\b|\bTj\b/.test(raw.toString('latin1')) ? raw.toString('latin1') : null
    }
    if (!content) continue

    const lines: string[] = []
    for (const op of content.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj|\[((?:[^\][\\]|\\.)*)\]\s*TJ|\((?:[^()\\]|\\.)*\)\s*'/g)) {
      const fragment = op[0] ?? ''
      const pieces = [...fragment.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((m) => decodePdfString(m[1] ?? ''))
      const line = pieces.join('')
      if (line.trim()) lines.push(line)
    }
    if (lines.length) chunks.push(lines.join('\n'))
  }

  const text = chunks.join('\n')
  if (!text.trim()) {
    warnings.push('No text layer found in PDF; OCR is required to read this document.')
  }
  return { kind: 'pdf', text, tables: [], pageCount, needsOcr: !text.trim(), warnings }
}
