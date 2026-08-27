import type { Metadata } from 'next'
import { Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="eyebrow">About</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Private healthcare investing runs on spreadsheets and relationships. It should run on data.
      </h1>

      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-ink-secondary">
        <p>
          Most private healthcare deals are raised the same way: a spreadsheet, a PDF summary, and a
          list of people the operator already knows. An investor gets a memo written to persuade
          them, a return figure with no assumptions attached, and no way to check any of it without
          asking for documents one at a time.
        </p>
        <p>
          None of that is dishonest. It is just how the work has always been done, and it means the
          people who can invest are the people already in the room — while the ones who are there
          are deciding on a number they cannot take apart.
        </p>
        <p>
          CareCapital Exchange does the mechanical half and leaves the judgement where it belongs.
          Documents are read and reconciled automatically. Every metric is computed deterministically
          and traced to the page it came from. Every projection carries the assumptions that produced
          it, and changing one changes the number. And the decisions — which figure is correct, what
          terms to offer, whether to invest — stay with the people accountable for them.
        </p>
      </div>

      <Card className="mt-10 p-6">
        <h2 className="text-[16px] font-semibold text-ink">Principles</h2>
        <dl className="mt-4 space-y-4">
          {[
            { term: 'Never invent a number', detail: 'If a figure is not in the documents, the platform reports nothing. A blank is a fact; a plausible estimate on a nine-figure capital stack is a liability.' },
            { term: 'Never resolve a conflict silently', detail: 'Where two sources disagree, both are shown with their provenance and the conflict is raised. The platform does not pick a winner.' },
            { term: 'Arithmetic belongs in code', detail: 'Every ratio is computed by a tested function with its formula and inputs recorded. Language models read, compare and question; they do not calculate.' },
            { term: 'No recommendations', detail: 'The platform produces analysis and matches against what people have published about themselves. It never states or implies that an investment is a good one, and no listing is ranked by who is paying.' },
            { term: 'A projection is never a promise', detail: 'Every forward-looking figure is labelled where it appears and carries the assumptions it came from. Nothing here is described as expected, safe or guaranteed.' },
            { term: 'Confidentiality by default', detail: 'A raise is private until the operator publishes it. Investors never see each other’s identities or amounts, and documents are released at the access level the operator sets.' },
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
          This is a working demonstration. Every organisation, facility, investor and financial
          figure shown is fictional and generated for the purpose of exercising the product. No
          real investment is being offered, and no money can move through it.
        </p>
      </Card>
    </div>
  )
}
