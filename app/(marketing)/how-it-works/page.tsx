import Link from 'next/link'
import type { Metadata } from 'next'
import { Button, Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'How it works' }

const STAGES = [
  {
    phase: 'Intake',
    steps: [
      { title: 'Describe the transaction', body: 'Transaction type, asset type, facility, beds, census, ownership. Six screens, and you can come back to any of them.' },
      { title: 'State what you are asking for', body: 'Purchase price, requested financing, existing debt, seller financing, closing costs, capital plan and target close date.' },
    ],
  },
  {
    phase: 'Documents',
    steps: [
      { title: 'Upload what you have', body: 'Operating statements, balance sheet, census, payer mix, tax returns, AR aging, debt schedule, purchase agreement, appraisal. PDF, Excel, CSV, Word or images.' },
      { title: 'The pipeline reads them', body: 'Malware scan, file-type detection, text and table extraction, OCR where a document has no text layer, then structured extraction with a confidence score on every field.' },
    ],
  },
  {
    phase: 'Reconciliation',
    steps: [
      { title: 'Every source is compared to every other', body: 'Operating statements against tax returns, census against the stated occupancy, the debt schedule against the balance sheet, the appraisal against the contract price.' },
      { title: 'Conflicts become work items, not guesses', body: 'When two documents disagree, both values are shown with their sources, along with the question a lender would ask. You decide which figure is right.' },
    ],
  },
  {
    phase: 'Underwriting',
    steps: [
      { title: 'Deterministic metrics', body: 'LTV, loan-to-cost, underwritten NOI, annual debt service, DSCR, debt yield, EBITDA margin, growth, sources and uses, equity requirement and balloon balance — computed in code, with the formula and inputs recorded.' },
      { title: 'Analysis and a transparent score', body: 'Strengths, risks, likely lender questions, missing information and mitigants, plus a deal score whose six components and weights are all visible.' },
    ],
  },
  {
    phase: 'Packaging',
    steps: [
      { title: 'Credit memo', body: 'A full institutional memo — executive summary through conclusion — where financial facts carry a citation back to the document and page they came from.' },
      { title: 'Readiness check', body: 'A completeness score across data, documents, financials and underwriting, with a specific list of what is still outstanding before the package goes to lenders.' },
    ],
  },
  {
    phase: 'Distribution',
    steps: [
      { title: 'Matching', body: 'Your deal is scored against every verified lender’s published criteria. Each match shows which criteria it clears, by how much, and what the lender is likely to probe.' },
      { title: 'You choose who sees it', body: 'Before anything is sent you see the full recipient list and confirm it. Every distribution is recorded in the audit log.' },
    ],
  },
  {
    phase: 'Financing',
    steps: [
      { title: 'Indications arrive in one format', body: 'Amount, rate, index and spread, term, amortization, interest-only, fees, prepayment, recourse, guarantees, covenants, conditions and timeline.' },
      { title: 'Compare on your own priority', body: 'Rank by financing cost, proceeds, term, interest-only, fees, recourse or speed. Effective cost is computed from the actual cash flows, so fee structures are comparable.' },
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <p className="eyebrow">How it works</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        From a folder of documents to a package lenders can act on.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
        The workflow below is what a healthcare financing broker does over several weeks. The
        platform automates the mechanical parts of it and keeps you in control of every judgement.
      </p>

      <div className="mt-12 space-y-8">
        {STAGES.map((stage, index) => (
          <div key={stage.phase} className="grid gap-5 sm:grid-cols-[140px_1fr]">
            <div className="sm:pt-1">
              <span className="tnum text-[11px] font-semibold text-ink-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="mt-1 text-[14px] font-semibold uppercase tracking-[0.05em] text-ink">
                {stage.phase}
              </p>
            </div>
            <div className="space-y-3">
              {stage.steps.map((step) => (
                <Card key={step.title} className="p-4">
                  <p className="text-[13px] font-semibold text-ink">{step.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">{step.body}</p>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-12 p-6">
        <h2 className="text-[16px] font-semibold text-ink">What the platform does not do</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-secondary">
          <li>· It does not lend, approve credit, or commit to any financing.</li>
          <li>· It does not tell you a lender will approve your loan — only how your deal measures against criteria that lender has published.</li>
          <li>· It does not estimate a financial figure that is absent from your documents.</li>
          <li>· It does not give legal, tax, accounting or investment advice.</li>
        </ul>
      </Card>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/signup?intent=find_financing"><Button variant="primary" size="lg">Submit a Deal</Button></Link>
        <Link href="/for-lenders"><Button size="lg">For Lenders</Button></Link>
      </div>
    </div>
  )
}
