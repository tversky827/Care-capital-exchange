import type { DataRequestList } from '@/lib/ai/schemas'
import type { DealReadiness } from '@/lib/underwriting/readiness'
import type { LendingBox } from '@/types'

/**
 * Builds the "what do we still need" checklist.
 *
 * Two inputs drive it: the platform's own readiness assessment, and the
 * documentary requirements of the specific lenders a deal is going to. That
 * second half is the point of §75 — if one lender needs an environmental
 * report and another does not, the borrower should only be asked once, and
 * only when it is actually needed.
 */
export function buildDataRequests(
  readiness: DealReadiness,
  options: {
    presentDocTypes: Set<string>
    targetBoxes?: LendingBox[]
    taxReturnYearsOnFile?: number
  } = { presentDocTypes: new Set() },
): DataRequestList {
  const items: DataRequestList['items'] = readiness.outstanding
    .filter((item) => item.docType || item.importance === 'required')
    .map((item) => ({
      label: item.label,
      detail: item.detail,
      doc_type: item.docType ?? 'other',
      importance: item.importance,
    }))

  const seen = new Set(items.map((i) => i.label))
  const boxes = options.targetBoxes ?? []

  // Lender-specific requirements, requested only when some target lender
  // actually needs them.
  if (boxes.some((b) => b.requires_appraisal) && !options.presentDocTypes.has('appraisal')) {
    const who = boxes.filter((b) => b.requires_appraisal).length
    const label = 'Third-party appraisal'
    if (!seen.has(label)) {
      items.push({
        label,
        detail: `${who} of the ${boxes.length} lenders being approached require an appraisal before issuing an indication.`,
        doc_type: 'appraisal',
        importance: 'required',
      })
      seen.add(label)
    }
  }

  if (boxes.some((b) => b.requires_environmental) && !options.presentDocTypes.has('environmental')) {
    const who = boxes.filter((b) => b.requires_environmental).length
    items.push({
      label: 'Phase I environmental site assessment',
      detail: `Required by ${who} of the ${boxes.length} lenders being approached. The remaining lenders do not require it, so this is only needed if you intend to include those ${who}.`,
      doc_type: 'environmental',
      importance: who === boxes.length ? 'required' : 'recommended',
    })
  }

  const maxTaxYears = boxes.reduce((max, b) => Math.max(max, b.required_tax_return_years), 0)
  const onFile = options.taxReturnYearsOnFile ?? 0
  if (maxTaxYears > onFile) {
    items.push({
      label: `${maxTaxYears} years of business tax returns`,
      detail: onFile
        ? `${onFile} year${onFile === 1 ? '' : 's'} on file; the most demanding lender in this group requires ${maxTaxYears}.`
        : `The most demanding lender in this group requires ${maxTaxYears} years.`,
      doc_type: 'tax_return',
      importance: 'required',
    })
  }

  return { items: items.slice(0, 40) }
}
