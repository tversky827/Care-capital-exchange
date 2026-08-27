import Link from 'next/link'
import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'For operators' }

export default function ForOperatorsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <p className="eyebrow">For operators</p>
      <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Raise equity from investors who want what you have.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">
        Put up one property and one set of terms. Your figures are underwritten once, shown the same
        way to everyone, and matched against what investors say they are looking for.
      </p>

      <div className="mt-12 grid gap-px border border-line bg-line md:grid-cols-2">
        {[
          {
            title: 'One raise, not fifty conversations',
            body: 'You upload your statements once. The platform produces the listing every investor sees — the metrics, the projections, the data room — in the same form for all of them. No re-cutting the numbers for each conversation.',
          },
          {
            title: 'Know the questions before they are asked',
            body: 'The analysis names the specific things an investor will raise: an agency labour trend, a payer concentration, a margin that moved the wrong way, an appraisal below contract. You answer them once, in the listing.',
          },
          {
            title: 'Reach investors who want your kind of deal',
            body: 'Matching runs your raise against what each investor has said they look for — asset type, geography, cheque size, hold period, risk appetite — and shows the reasoning. An investor your raise does not suit is not sent it.',
          },
          {
            title: 'Terms an investor can actually check',
            body: 'Preferred return, promote, fees, waterfall and hold are stated once and computed by tested code. An investor can model any cheque size against your own assumptions and see exactly what produces the number.',
          },
          {
            title: 'Your data stays yours',
            body: 'Nothing is visible until you publish. You control which documents are released and at which stage of an investor’s interest, can mark any document as never leaving your organisation, and every view and download is logged.',
          },
          {
            title: 'A record you can hand to anyone',
            body: 'Every figure traces to a document and page. Every status change, approval, publication and investor access is in an immutable audit log.',
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
            'The terms you are offering — how much, minimum cheque, hold',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] text-ink-secondary">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
          You do not need all of it to start. Add the property with what you have; the readiness
          checklist tells you exactly what is still outstanding before the raise can be published.
        </p>
      </Card>

      <div className="mt-10">
        <Link href="/signup?intent=find_financing"><Button variant="primary" size="lg">Start a raise</Button></Link>
      </div>
    </div>
  )
}
