import Link from 'next/link'
import type { Metadata } from 'next'
import { Button, Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'How it works' }

const STAGES = [
  {
    phase: 'Intake',
    steps: [
      { title: 'Describe the transaction', body: 'Transaction type, asset type, facility, beds, census, ownership. Six screens, and you can come back to any of them.' },
      { title: 'State what the deal is', body: 'Purchase price, senior debt, existing debt, seller financing, closing costs, capital plan and target close date.' },
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
      { title: 'Conflicts become work items, not guesses', body: 'When two documents disagree, both values are shown with their sources, along with the question an investor would ask. You decide which figure is right.' },
    ],
  },
  {
    phase: 'Underwriting',
    steps: [
      { title: 'Deterministic metrics', body: 'Underwritten NOI, debt service, coverage, leverage, EBITDA margin, growth, sources and uses, and the equity the deal actually needs — computed in code, with the formula and inputs recorded.' },
      { title: 'Analysis and a transparent score', body: 'Strengths, risks, the questions an investor will ask, missing information and mitigants, plus a score whose six components and weights are all visible.' },
    ],
  },
  {
    phase: 'Packaging',
    steps: [
      { title: 'The written record', body: 'A full institutional write-up — executive summary through conclusion — where every financial fact carries a citation back to the document and page it came from.' },
      { title: 'Readiness check', body: 'A completeness score across data, documents, financials and underwriting, with a specific list of what is still outstanding before the raise can be published.' },
    ],
  },
  {
    phase: 'The raise',
    steps: [
      { title: 'You state the terms', body: 'How much you are raising, the minimum cheque, the preferred return, your promote, the fees, the hold period, and the assumptions every projection will be run from.' },
      { title: 'The projection is computed, not written', body: 'Year-by-year cash flow, the distribution waterfall, IRR, equity multiple and cash-on-cash — all produced by tested code from your stated assumptions, never by a model that could invent one.' },
    ],
  },
  {
    phase: 'Publication',
    steps: [
      { title: 'Review before anything is visible', body: 'An administrator checks that the disclosure package is complete and internally consistent. Review is not an endorsement and is not a judgement about the investment.' },
      { title: 'Matching', body: 'Your raise is scored against what each investor has said they look for. Each match shows what fits and what does not, and an investor your raise does not suit is not sent it.' },
    ],
  },
  {
    phase: 'Investors',
    steps: [
      { title: 'They read before they decide', body: 'Your statements, the projections and their assumptions, a risk score computed from your own figures, and a modelled case for what happens if it goes badly. They can question the record and get the document any answer came from.' },
      { title: 'Interest, then a commitment', body: 'An investor tells you they are interested, then records what they intend to invest. Both come to you with what they said. No money moves through CareCapital Exchange, and no securities transaction happens here.' },
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <p className="eyebrow">How it works</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        From a folder of documents to a raise investors can read.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
        The steps below are what an operator and their advisers do over several weeks before an
        investor ever sees a number. The platform does the mechanical parts and keeps every
        judgement with the people who should be making it.
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
          <li>· It is not a broker-dealer, investment adviser, funding portal or custodian.</li>
          <li>· It does not recommend investments, and no listing is ranked by who is paying.</li>
          <li>· It never holds or moves money, and no securities transaction is effected here.</li>
          <li>· It does not estimate a financial figure that is absent from the documents.</li>
          <li>· It does not give legal, tax, accounting or investment advice.</li>
        </ul>
      </Card>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/signup?intent=invest"><Button variant="primary" size="lg">Browse investments</Button></Link>
        <Link href="/for-borrowers"><Button size="lg">I run a facility</Button></Link>
      </div>
    </div>
  )
}
