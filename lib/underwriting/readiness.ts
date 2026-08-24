import type { DealSnapshot } from '@/lib/deal/snapshot'
import type { DocumentType } from '@/types'

/**
 * Deal readiness.
 *
 * Answers the question every screen in this product is supposed to answer:
 * what do I need to do next? Readiness is measured across four dimensions and
 * produces a concrete, ordered checklist rather than a bare percentage.
 *
 * A deal below the distribution threshold cannot be sent to lenders without an
 * administrator override — sending an incomplete package wastes the lender's
 * time and burns the borrower's credibility on their first impression.
 */

export const DISTRIBUTION_THRESHOLD = 70

export interface ReadinessItem {
  key: string
  label: string
  detail: string
  importance: 'required' | 'recommended' | 'optional'
  dimension: ReadinessDimensionKey
  href: string | null
  docType: DocumentType | null
}

export type ReadinessDimensionKey = 'data' | 'documents' | 'financial' | 'underwriting'

export interface ReadinessDimension {
  key: ReadinessDimensionKey
  label: string
  weight: number
  score: number
  satisfied: number
  total: number
}

export interface DealReadiness {
  overall: number
  dimensions: ReadinessDimension[]
  outstanding: ReadinessItem[]
  requiredOutstanding: ReadinessItem[]
  canDistribute: boolean
  blockingReason: string | null
}

interface Check {
  key: string
  label: string
  detail: string
  importance: ReadinessItem['importance']
  dimension: ReadinessDimensionKey
  satisfied: boolean
  href?: string | null
  docType?: DocumentType | null
}

const DIMENSION_WEIGHTS: Record<ReadinessDimensionKey, number> = {
  data: 0.25,
  documents: 0.3,
  financial: 0.3,
  underwriting: 0.15,
}

const DIMENSION_LABELS: Record<ReadinessDimensionKey, string> = {
  data: 'Data completeness',
  documents: 'Document completeness',
  financial: 'Financial completeness',
  underwriting: 'Underwriting completeness',
}

export function assessReadiness(
  snapshot: DealSnapshot,
  context: { hasUnderwritingRun: boolean; hasCreditMemo: boolean },
): DealReadiness {
  const { deal, facility, terms, sponsor, metrics, periods, documents, openDiscrepancies } = snapshot
  const base = `/deals/${deal.id}`
  const present = new Set(documents.map((d) => d.doc_type))
  // Only a transaction that actually buys something needs a purchase price;
  // a refinance, bridge, CapEx or working-capital request has none.
  const isAcquisition = ['acquisition', 'acquisition_refinance'].includes(deal.transaction_type)

  const checks: Check[] = [
    // --- Data ------------------------------------------------------------
    { key: 'facility_identity', label: 'Facility name, address and state', detail: 'Lenders screen on geography before anything else.', importance: 'required', dimension: 'data', satisfied: Boolean(facility?.name && facility.state), href: `${base}/overview` },
    { key: 'bed_count', label: 'Licensed and operating bed count', detail: 'Bed count anchors every per-bed metric a lender computes.', importance: 'required', dimension: 'data', satisfied: Boolean(facility?.licensed_beds), href: `${base}/overview` },
    { key: 'census', label: 'Current census and occupancy', detail: 'Occupancy is the primary operating screen for skilled nursing.', importance: 'required', dimension: 'data', satisfied: facility?.current_census != null || facility?.occupancy_pct != null, href: `${base}/operations` },
    { key: 'payer_mix', label: 'Payer mix breakdown', detail: 'Medicaid concentration determines which lenders can participate.', importance: 'required', dimension: 'data', satisfied: metrics?.medicaid_pct != null || metrics?.medicare_pct != null, href: `${base}/operations` },
    { key: 'sponsor_profile', label: 'Sponsor operating history', detail: 'Operator experience is a stated criterion in most lending boxes.', importance: 'required', dimension: 'data', satisfied: Boolean(sponsor?.years_in_healthcare != null || sponsor?.facilities_operated != null), href: `${base}/sponsor` },
    { key: 'property_detail', label: 'Year built and last renovation', detail: 'Drives the replacement reserve and deferred maintenance view.', importance: 'recommended', dimension: 'data', satisfied: Boolean(facility?.year_built), href: `${base}/overview` },

    // --- Documents -------------------------------------------------------
    { key: 'doc_pl', label: 'Trailing operating statements', detail: 'At least two full years plus the current period.', importance: 'required', dimension: 'documents', satisfied: present.has('profit_and_loss'), href: `${base}/documents`, docType: 'profit_and_loss' },
    { key: 'doc_balance_sheet', label: 'Balance sheet', detail: 'Required to underwrite working capital and existing obligations.', importance: 'required', dimension: 'documents', satisfied: present.has('balance_sheet'), href: `${base}/documents`, docType: 'balance_sheet' },
    { key: 'doc_census', label: 'Census detail', detail: 'Monthly census supporting the stated occupancy.', importance: 'required', dimension: 'documents', satisfied: present.has('census'), href: `${base}/documents`, docType: 'census' },
    { key: 'doc_payer_mix', label: 'Payer mix detail', detail: 'Revenue and days by payer category.', importance: 'required', dimension: 'documents', satisfied: present.has('payer_mix'), href: `${base}/documents`, docType: 'payer_mix' },
    { key: 'doc_tax_return', label: 'Business tax returns', detail: 'Most lenders require two to three years.', importance: 'recommended', dimension: 'documents', satisfied: present.has('tax_return'), href: `${base}/documents`, docType: 'tax_return' },
    { key: 'doc_debt_schedule', label: 'Current debt schedule', detail: 'Needed to confirm payoff amounts and any assumed debt.', importance: 'recommended', dimension: 'documents', satisfied: present.has('existing_debt'), href: `${base}/documents`, docType: 'existing_debt' },
    { key: 'doc_ar_aging', label: 'Accounts receivable aging', detail: 'Collection performance is a leading indicator of revenue quality.', importance: 'recommended', dimension: 'documents', satisfied: present.has('ar_aging'), href: `${base}/documents`, docType: 'ar_aging' },
    { key: 'doc_license', label: 'Facility license', detail: 'Confirms licensed capacity and operator of record.', importance: 'recommended', dimension: 'documents', satisfied: present.has('license'), href: `${base}/documents`, docType: 'license' },
    ...(isAcquisition
      ? ([
          { key: 'doc_psa', label: 'Purchase agreement or LOI', detail: 'Establishes price, timing and conditions.', importance: 'required', dimension: 'documents', satisfied: present.has('purchase_agreement') || present.has('loi'), href: `${base}/documents`, docType: 'purchase_agreement' },
          { key: 'doc_appraisal', label: 'Appraisal', detail: 'Sets the value basis lenders size against.', importance: 'recommended', dimension: 'documents', satisfied: present.has('appraisal'), href: `${base}/documents`, docType: 'appraisal' },
        ] as Check[])
      : []),

    // --- Financial -------------------------------------------------------
    { key: 'two_periods', label: 'Two or more historical periods', detail: 'A single period gives lenders no trend to underwrite.', importance: 'required', dimension: 'financial', satisfied: periods.filter((p) => p.period.period_type !== 'projection').length >= 2, href: `${base}/financials` },
    { key: 'revenue_ebitda', label: 'Revenue and EBITDA for the latest period', detail: 'Without these no coverage metric can be computed.', importance: 'required', dimension: 'financial', satisfied: snapshot.latest?.items.revenue != null && snapshot.latest?.items.ebitda != null, href: `${base}/financials` },
    { key: 'transaction_terms', label: isAcquisition ? 'Purchase price and requested financing' : 'Requested financing amount', detail: 'Required to compute leverage and size the request.', importance: 'required', dimension: 'financial', satisfied: terms?.requested_financing != null && (!isAcquisition || terms?.purchase_price != null), href: `${base}/transaction` },
    { key: 'expense_detail', label: 'Expense detail including labor and agency', detail: 'Agency reliance is the first thing a healthcare lender examines.', importance: 'recommended', dimension: 'financial', satisfied: snapshot.latest?.items.labor_expense != null, href: `${base}/financials` },
    { key: 'reviewed_extractions', label: 'Extracted values reviewed and approved', detail: 'Unreviewed AI-extracted values are not used as the deal figure.', importance: 'required', dimension: 'financial', satisfied: periods.every((p) => p.pending.length === 0), href: `${base}/financials` },

    // --- Underwriting ----------------------------------------------------
    { key: 'discrepancies', label: 'Open discrepancies resolved', detail: `${openDiscrepancies.length} item${openDiscrepancies.length === 1 ? '' : 's'} still need attention.`, importance: 'required', dimension: 'underwriting', satisfied: openDiscrepancies.filter((d) => d.severity === 'critical' || d.severity === 'high').length === 0, href: `${base}/issues` },
    { key: 'underwriting_run', label: 'Underwriting analysis completed', detail: 'Produces the deal score, risks and lender questions.', importance: 'required', dimension: 'underwriting', satisfied: context.hasUnderwritingRun, href: `${base}/analysis` },
    { key: 'credit_memo', label: 'Credit memo generated', detail: 'The lender-facing package. Generate it before distributing.', importance: 'required', dimension: 'underwriting', satisfied: context.hasCreditMemo, href: `${base}/memo` },
  ]

  const dimensions: ReadinessDimension[] = (Object.keys(DIMENSION_WEIGHTS) as ReadinessDimensionKey[]).map((key) => {
    const scoped = checks.filter((c) => c.dimension === key)
    // Required items carry twice the weight of recommended ones.
    const weightOf = (c: Check) => (c.importance === 'required' ? 2 : 1)
    const total = scoped.reduce((sum, c) => sum + weightOf(c), 0)
    const earned = scoped.filter((c) => c.satisfied).reduce((sum, c) => sum + weightOf(c), 0)
    return {
      key,
      label: DIMENSION_LABELS[key],
      weight: DIMENSION_WEIGHTS[key],
      score: total ? Math.round((earned / total) * 100) : 100,
      satisfied: scoped.filter((c) => c.satisfied).length,
      total: scoped.length,
    }
  })

  const overall = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0))
  const outstanding: ReadinessItem[] = checks
    .filter((c) => !c.satisfied)
    .map((c) => ({
      key: c.key, label: c.label, detail: c.detail, importance: c.importance,
      dimension: c.dimension, href: c.href ?? null, docType: c.docType ?? null,
    }))
    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'required' ? -1 : 1))

  const requiredOutstanding = outstanding.filter((item) => item.importance === 'required')
  const canDistribute = overall >= DISTRIBUTION_THRESHOLD && requiredOutstanding.length === 0

  let blockingReason: string | null = null
  if (!canDistribute) {
    blockingReason =
      requiredOutstanding.length > 0
        ? `${requiredOutstanding.length} required item${requiredOutstanding.length === 1 ? '' : 's'} outstanding before this package is ready for lenders.`
        : `Deal readiness is ${overall}%, below the ${DISTRIBUTION_THRESHOLD}% distribution threshold.`
  }

  return { overall, dimensions, outstanding, requiredOutstanding, canDistribute, blockingReason }
}
