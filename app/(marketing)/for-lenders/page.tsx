import Link from 'next/link'
import type { Metadata } from 'next'
import { Button, Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'For lenders' }

export default function ForLendersPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <p className="eyebrow">For lenders</p>
      <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Stop spending time on deals outside your lending box.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">
        Publish your criteria once. Receive healthcare financing opportunities that already meet
        them, in a standardised package, with the underwriting work already done.
      </p>

      <div className="mt-12 grid gap-px border border-line bg-line md:grid-cols-3">
        {[
          { title: 'Define your box', body: 'Loan size, maximum LTV, minimum DSCR and debt yield, occupancy floor, states, asset types, transaction types, operator experience, payer concentration, and the documents you require.' },
          { title: 'Screening runs itself', body: 'Every new opportunity is scored against your criteria before it reaches you. Deals outside your box are never sent, and near-misses are labelled as near-misses.' },
          { title: 'Every deal in the same shape', body: 'The same metrics, the same credit memo structure, the same data room categories. No two-week wait for a borrower to assemble a package.' },
          { title: 'The data you actually need', body: 'Trailing operating statements, census and occupancy history, payer mix, agency labour, sponsor operating history, sources and uses, and coverage under your own terms.' },
          { title: 'Your pipeline, your notes', body: 'A stage-based pipeline from new match through credit committee to funded, with internal notes that no borrower and no competing lender can ever see.' },
          { title: 'Competitive integrity', body: 'You never see another lender’s indication, and they never see yours. Borrower and lender contact details are not exchanged; the platform carries the conversation.' },
        ].map((item) => (
          <div key={item.title} className="bg-surface p-5">
            <p className="text-[13px] font-semibold text-ink">{item.title}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{item.body}</p>
          </div>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <h2 className="text-[16px] font-semibold text-ink">Verification</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
          Lender organisations are verified by a platform administrator before receiving any
          opportunity. Until verification completes you can build your profile and lending box, but
          no borrower deal, document or identity is visible to you. Borrowers are told only that a
          lender is verified — never anything about your internal strategy.
        </p>
      </Card>

      <div className="mt-10">
        <Link href="/signup?intent=provide_financing"><Button variant="primary" size="lg">Become a Lender</Button></Link>
      </div>
    </div>
  )
}
