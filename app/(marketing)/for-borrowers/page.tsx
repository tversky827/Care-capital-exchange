import Link from 'next/link'
import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'For borrowers' }

export default function ForBorrowersPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <p className="eyebrow">For borrowers</p>
      <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Stop sending the same deal to fifteen banks.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">
        Assemble the package once, find out what lenders will question before they ask, and put your
        opportunity in front of the institutions whose criteria actually fit it.
      </p>

      <div className="mt-12 grid gap-px border border-line bg-line md:grid-cols-2">
        {[
          {
            title: 'One package, not fifteen conversations',
            body: 'You upload your statements once. The platform produces a standardised financing package — metrics, credit memo, data room — that every lender receives in the same form. No re-formatting for each bank’s template.',
          },
          {
            title: 'Know the questions before they are asked',
            body: 'The analysis names the specific items a credit committee will raise: an agency labour trend, a payer concentration, a margin that moved the wrong way, an appraisal below contract. You answer them once, in the package.',
          },
          {
            title: 'Find lenders that fit, not lenders you know',
            body: 'Matching runs your deal against each verified lender’s published criteria and shows the reasoning: which tests it clears, by how much, and where it is tight. A deal outside a lender’s box is flagged as outside it rather than sent anyway.',
          },
          {
            title: 'Compare indications properly',
            body: 'A 6.9% loan with two points of fees is not cheaper than a 7.4% loan with none. Effective cost is solved from the actual cash flows, and you can rank offers by the priority you actually have — cost, proceeds, term, interest-only, recourse or speed.',
          },
          {
            title: 'Your data stays yours',
            body: 'Nothing is visible until you distribute. On the marketplace your facility appears anonymised. You control which documents lenders see, can mark any document as never leaving your organisation, and every view and download is logged.',
          },
          {
            title: 'A record you can hand to anyone',
            body: 'Every figure in the credit memo traces to a document and page. Every status change, approval, distribution and lender access is in an immutable audit log.',
          },
        ].map((item) => (
          <div key={item.title} className="bg-surface p-6">
            <p className="text-[14px] font-semibold text-ink">{item.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">{item.body}</p>
          </div>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <p className="eyebrow">What you need to get started</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            'Two to three years of operating statements',
            'Current balance sheet',
            'Monthly census detail',
            'Payer mix by revenue and days',
            'Business tax returns',
            'Accounts receivable aging',
            'Current debt schedule, if refinancing',
            'Purchase agreement and appraisal, if acquiring',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] text-ink-secondary">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
          You do not need all of it to start. Create the deal with what you have; the readiness
          checklist tells you exactly what is still outstanding before the package goes to lenders.
        </p>
      </Card>

      <div className="mt-10">
        <Link href="/signup?intent=find_financing"><Button variant="primary" size="lg">Submit Your Deal</Button></Link>
      </div>
    </div>
  )
}
