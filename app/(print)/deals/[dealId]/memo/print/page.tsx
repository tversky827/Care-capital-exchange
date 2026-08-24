import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { loadDealForActor } from '@/lib/access'
import { ForbiddenError } from '@/lib/policy'
import { currentMemo } from '@/services/memo'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { PrintTrigger } from './print-trigger'
import { formatCurrency, formatDate, formatPercent, formatRatio, titleize } from '@/lib/utils/format'

export const metadata = { title: 'Credit memorandum' }

/**
 * Print view.
 *
 * A dedicated, chrome-free render of the memo. The browser's own print-to-PDF
 * is the export path: it produces a correct, selectable, accessible PDF without
 * shipping a headless browser or a PDF library, and it honours the reader's
 * page size and margins.
 */
export default async function MemoPrintPage({
  params, searchParams,
}: {
  params: Promise<{ dealId: string }>
  searchParams: Promise<{ download?: string }>
}) {
  const { dealId } = await params
  const { download } = await searchParams
  const actor = await requireActor()

  try {
    await loadDealForActor(actor, dealId)
  } catch (error) {
    if (error instanceof ForbiddenError) notFound()
    throw error
  }

  const [current, snapshot] = await Promise.all([currentMemo(dealId), buildSnapshot(dealId)])
  if (!current || !snapshot) notFound()

  const { version } = current
  const { deal, facility, summary } = snapshot

  return (
    <div className="mx-auto max-w-3xl bg-white px-10 py-10 text-ink">
      {download ? <PrintTrigger /> : null}

      <header className="border-b-2 border-ink pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          CareCapital Exchange · Credit Memorandum
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight">{facility?.name ?? deal.name}</h1>
        <p className="mt-1 text-[12px] text-ink-secondary">
          {deal.reference} · {titleize(deal.transaction_type)} · {titleize(deal.asset_type)}
          {facility ? ` · ${[facility.city, facility.state].filter(Boolean).join(', ')}` : ''}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Version {version.version} · {formatDate(version.created_at, 'long')}
          {deal.is_demo ? ' · DEMO DATA — NOT A REAL TRANSACTION' : ''}
        </p>
      </header>

      <table className="mt-5 w-full border-collapse text-[11px]">
        <tbody>
          <tr>
            <PrintCell label="Requested financing" value={formatCurrency(summary.loanAmount)} />
            <PrintCell label="LTV" value={formatPercent(summary.ltv)} />
            <PrintCell label="DSCR" value={formatRatio(summary.dscr)} />
            <PrintCell label="Debt yield" value={formatPercent(summary.debtYield)} />
          </tr>
          <tr>
            <PrintCell label="Underwritten NOI" value={formatCurrency(summary.noi)} />
            <PrintCell label="Annual debt service" value={formatCurrency(summary.annualDebtService)} />
            <PrintCell label="EBITDA margin" value={formatPercent(summary.ebitdaMargin)} />
            <PrintCell label="Occupancy" value={formatPercent(facility?.occupancy_pct ?? summary.occupancyPct)} />
          </tr>
        </tbody>
      </table>

      {version.sections.map((section) => (
        <section key={section.key} className="print-block mt-7">
          <h2 className="border-b border-line pb-1 text-[14px] font-semibold uppercase tracking-[0.04em]">
            {section.title}
          </h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-ink-secondary">
            {section.body}
          </pre>
          {section.citations.length > 0 ? (
            <ol className="mt-3 space-y-0.5 border-t border-line pt-2 text-[10px] text-ink-muted">
              {section.citations.map((citation) => (
                <li key={citation.marker}>
                  {citation.marker} {citation.label}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}

      <footer className="mt-10 border-t border-line pt-4 text-[10px] leading-relaxed text-ink-muted">
        <p>
          This memorandum was prepared by CareCapital Exchange from documents and information supplied
          by the borrower and has not been independently verified. It is analysis prepared to support a
          lender&apos;s own underwriting. It is not a credit approval, a commitment to lend, an offer of
          financing, or legal, tax, accounting or investment advice. Each lender must reach its own
          credit conclusion.
        </p>
        <p className="mt-2">Generated {formatDate(version.created_at, 'long')} · {deal.reference}</p>
      </footer>
    </div>
  )
}

function PrintCell({ label, value }: { label: string; value: string }) {
  return (
    <td className="border border-line px-2 py-1.5 align-top">
      <span className="block text-[9px] uppercase tracking-[0.06em] text-ink-muted">{label}</span>
      <span className="tnum mt-0.5 block text-[13px] font-semibold">{value}</span>
    </td>
  )
}
