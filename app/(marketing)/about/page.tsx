import type { Metadata } from 'next'
import { Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="eyebrow">About</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Healthcare financing runs on spreadsheets and relationships. It should run on data.
      </h1>

      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-ink-secondary">
        <p>
          A skilled nursing acquisition takes six to twelve weeks to finance, and most of that time
          is not spent on credit judgement. It is spent collecting documents, re-keying them into
          spreadsheets, reconciling statements that disagree, assembling a package, working out
          which of several hundred lenders might have appetite, and then answering the same twelve
          questions from each of them in turn.
        </p>
        <p>
          None of that work requires judgement. All of it requires attention, and it is the reason a
          borrower pays a broker one to two points to run the process — and the reason a lender’s
          origination team spends most of its week on deals that were never inside its box.
        </p>
        <p>
          CareCapital Exchange automates the mechanical half and leaves the judgement where it
          belongs. Documents are read and reconciled automatically. Metrics are computed
          deterministically and traced to the page they came from. Deals are matched against
          criteria lenders publish themselves. And the human decisions — which figure is correct,
          which lenders see the deal, which offer to take — stay with the people accountable for
          them.
        </p>
      </div>

      <Card className="mt-10 p-6">
        <h2 className="text-[16px] font-semibold text-ink">Principles</h2>
        <dl className="mt-4 space-y-4">
          {[
            { term: 'Never invent a number', detail: 'If a figure is not in the documents, the platform reports nothing. A blank is a fact; a plausible estimate on a nine-figure capital stack is a liability.' },
            { term: 'Never resolve a conflict silently', detail: 'Where two sources disagree, both are shown with their provenance and the conflict is raised. The platform does not pick a winner.' },
            { term: 'Arithmetic belongs in code', detail: 'Every ratio is computed by a tested function with its formula and inputs recorded. Language models read, compare and question; they do not calculate.' },
            { term: 'No credit decisions', detail: 'The platform produces analysis and matches against published criteria. It never states or implies that any lender will approve any loan.' },
            { term: 'Confidentiality by default', detail: 'A deal is private until the borrower distributes it. Lender strategy stays inside the lender. Competing lenders never see each other’s terms.' },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-[13px] font-semibold text-ink">{item.term}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-6 border-warning/25 bg-warning-soft p-5">
        <p className="text-[13px] font-semibold text-warning">About this environment</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-warning/90">
          This is a working demonstration. Every organisation, facility, financial figure and lender
          shown is fictional and generated for the purpose of exercising the product. The lender
          names in the demonstration are invented and do not refer to any real institution.
        </p>
      </Card>
    </div>
  )
}
