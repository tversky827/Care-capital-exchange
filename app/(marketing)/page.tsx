import Link from 'next/link'
import { ArrowRight, CheckCircle2, FileSearch, Gauge, ShieldCheck, Sparkles, Upload, Users } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'

/**
 * Homepage.
 *
 * The example transaction is the centrepiece: showing a real, complete deal
 * summary communicates what the product does far more effectively than
 * describing it, and the figures are the same ones the demo data produces.
 */

const EXAMPLE = {
  facility: '120-bed Skilled Nursing Facility',
  state: 'Illinois',
  purchasePrice: 14_000_000,
  requested: 10_500_000,
  ltv: 75,
  dscr: 1.64,
  debtYield: 12.1,
  matches: 17,
  indications: 4,
}

const WORKFLOW = [
  { key: 'upload', label: 'Upload', icon: Upload, detail: 'Financial statements, census, payer mix, purchase agreement — in whatever form you have them.' },
  { key: 'analyze', label: 'Analyze', icon: FileSearch, detail: 'Figures are extracted, reconciled across documents, and underwritten into standard metrics.' },
  { key: 'match', label: 'Match', icon: Users, detail: 'Your deal is scored against each lender’s published criteria, with the reasoning shown.' },
  { key: 'finance', label: 'Finance', icon: Gauge, detail: 'Distribute one package, receive indications, and compare them side by side.' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-xl">
            <Badge tone="accent" className="mb-5">Skilled nursing · Senior housing · Healthcare</Badge>
            <h1 className="text-[38px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink lg:text-[46px]">
              Healthcare capital,<br />intelligently matched.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-secondary">
              Transform your healthcare financing opportunity into an institutional-quality financing
              package and connect with lenders whose lending criteria fit your deal.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup?intent=find_financing">
                <Button variant="primary" size="lg" className="gap-2">
                  Submit a Deal <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/for-lenders">
                <Button size="lg">For Lenders</Button>
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-1.5 text-[12px] text-ink-muted">
              <ShieldCheck className="size-3.5" />
              Your deal stays private until you decide who sees it.
            </p>
          </div>

          {/* Example transaction ------------------------------------------ */}
          <Card className="self-start">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="eyebrow">Example transaction</span>
              <Badge tone="warning">Illustrative — fictional</Badge>
            </div>
            <div className="border-b border-line px-4 py-3">
              <p className="text-[15px] font-semibold text-ink">{EXAMPLE.facility}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{EXAMPLE.state} · Acquisition financing</p>
            </div>
            <dl className="data-grid grid-cols-2">
              <ExampleCell label="Purchase price" value={formatCurrency(EXAMPLE.purchasePrice, { compact: true })} />
              <ExampleCell label="Financing request" value={formatCurrency(EXAMPLE.requested, { compact: true })} />
              <ExampleCell label="Loan-to-value" value={formatPercent(EXAMPLE.ltv, 0)} />
              <ExampleCell label="Debt service coverage" value={formatRatio(EXAMPLE.dscr)} />
              <ExampleCell label="Debt yield" value={formatPercent(EXAMPLE.debtYield)} />
              <ExampleCell label="Underwritten NOI" value={formatCurrency(1_270_500, { compact: true })} />
            </dl>
            <div className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px]">
                <CheckCircle2 className="size-4 shrink-0 text-positive" />
                <span className="text-ink"><strong className="tnum font-semibold">{EXAMPLE.matches}</strong> potential lender matches</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <CheckCircle2 className="size-4 shrink-0 text-positive" />
                <span className="text-ink"><strong className="tnum font-semibold">{EXAMPLE.indications}</strong> financing indications received</span>
              </div>
            </div>
            <p className="border-t border-line bg-surface-sunken px-4 py-2 text-[11px] leading-relaxed text-ink-muted">
              A match reflects a lender’s published lending criteria. It is not an indication that
              any lender will offer financing.
            </p>
          </Card>
        </div>
      </section>

      {/* Workflow --------------------------------------------------------- */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-px border border-line bg-line md:grid-cols-4">
            {WORKFLOW.map((step, index) => (
              <div key={step.key} className="bg-surface p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center bg-accent-soft text-accent">
                    <step.icon className="size-4" />
                  </span>
                  <span className="tnum text-[11px] font-semibold text-ink-muted">0{index + 1}</span>
                </div>
                <p className="mt-3 text-[14px] font-semibold uppercase tracking-[0.04em] text-ink">{step.label}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why healthcare is different ------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow">Why healthcare financing is different</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
              A skilled nursing facility is an operating business wearing a building.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">
              Generic commercial real estate financing tools underwrite the property. Healthcare
              lenders underwrite reimbursement risk, census durability, agency labour, licensure and
              survey history — and every one of those has a documentary trail that has to reconcile.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-secondary">
              That is the work a broker does over six weeks with a spreadsheet. This platform does
              the mechanical part of it in minutes, and shows its working.
            </p>
          </div>
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            {[
              { title: 'Reimbursement, not rent', body: 'Medicaid rates are set by the state, not by the operator. Payer concentration determines which lenders can participate at all.' },
              { title: 'Cash flow that moves', body: 'Census, agency labour and rate changes move EBITDA quickly. Lenders size against a stabilised view, not the best trailing quarter.' },
              { title: 'Documents that disagree', body: 'Operating statements, tax returns and census reports rarely reconcile perfectly. Every discrepancy is found in diligence eventually.' },
              { title: 'Narrow lender appetite', body: 'A lender that does 75% LTV skilled nursing in Illinois will not do 82% in Pennsylvania. Sending to fifteen banks wastes everyone’s time.' },
            ].map((item) => (
              <div key={item.title} className="bg-surface p-5">
                <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two audiences ---------------------------------------------------- */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-2">
          <AudienceCard
            eyebrow="For borrowers"
            title="Stop sending the same deal to fifteen banks."
            points={[
              'Build one lender-ready financing package.',
              'Know what lenders will question before they do.',
              'Find lenders whose stated criteria fit your deal.',
              'Compare financing indications in one place.',
            ]}
            href="/for-borrowers"
            cta="How it works for borrowers"
          />
          <AudienceCard
            eyebrow="For lenders"
            title="Stop spending time on deals outside your lending box."
            points={[
              'Receive standardised healthcare financing opportunities.',
              'See the data you actually need, in the same place every time.',
              'Screen against your own published criteria automatically.',
              'Build a healthcare lending pipeline without an origination team.',
            ]}
            href="/for-lenders"
            cta="How it works for lenders"
          />
        </div>
      </section>

      {/* AI ---------------------------------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-1.5"><Sparkles className="size-3" /> AI underwriting</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
              Analysis you can check, not a black box.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">
              Every ratio on this platform is computed in application code from figures traced to a
              specific document and page. The AI reads, compares, classifies and questions — it never
              does the arithmetic, and it never decides credit.
            </p>
          </div>
          <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-3">
            {[
              { title: 'It never invents a number', body: 'If a figure is not in your documents, the system returns nothing rather than an estimate. A blank is honest; a plausible guess on a $14M transaction is not.' },
              { title: 'It never resolves a conflict silently', body: 'When two documents disagree, both values are shown with their sources and the conflict is raised for you to resolve. Nothing is quietly overwritten.' },
              { title: 'It never approves anything', body: 'The platform produces analysis, a deal score with visible components, and a match against published criteria. Credit decisions belong to lenders.' },
            ].map((item) => (
              <div key={item.title} className="bg-surface p-5">
                <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ --------------------------------------------------------------- */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">Frequently asked</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {[
              { q: 'Is my deal visible to anyone before I decide?', a: 'No. A deal is private until you distribute it. You choose whether it goes to matched lenders, to specific lenders you select, or onto the marketplace — and you see exactly which institutions will receive it before you confirm.' },
              { q: 'Can lenders see my facility’s identity?', a: 'Only if you allow it. On the marketplace a deal appears as, for example, “120-bed Skilled Nursing Facility — Illinois”. Full identity, and the data room, are released only to lenders you distribute to.' },
              { q: 'Do I need a broker?', a: 'No. The platform automates the mechanical parts of what a financing broker does: collection, spreading, packaging, lender research, distribution and offer comparison. If you already work with a broker, they can run their client deals through it.' },
              { q: 'Does the platform lend or approve loans?', a: 'Neither. It is a marketplace and an underwriting workspace. Lenders submit financing indications — indications of interest, not commitments — and reach their own credit conclusions.' },
              { q: 'What happens to documents I upload?', a: 'They are stored encrypted at rest, served only through authorized, expiring links, and every view and download is logged. You control which documents lenders can see, and you can mark any document as never leaving your organisation.' },
            ].map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="cursor-pointer list-none text-[14px] font-medium text-ink marker:hidden">
                  <span className="flex items-start justify-between gap-4">
                    {item.q}
                    <span className="mt-1 shrink-0 text-ink-muted transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2.5 pr-8 text-[13px] leading-relaxed text-ink-secondary">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA ---------------------------------------------------------------- */}
      <section className="bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-14">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">
              Take a financing opportunity from “I need financing” to a lender-ready package.
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-secondary">
              Sign in to the demonstration environment with the seeded account, or create your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup?intent=find_financing">
              <Button variant="primary" size="lg">Submit Your Deal</Button>
            </Link>
            <Link href="/signup?intent=provide_financing">
              <Button size="lg">Become a Lender</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

function ExampleCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  )
}

function AudienceCard({
  eyebrow, title, points, href, cta,
}: {
  eyebrow: string
  title: string
  points: string[]
  href: string
  cta: string
}) {
  return (
    <Card className="flex flex-col p-6">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h3>
      <ul className="mt-4 flex-1 space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-secondary">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
            {point}
          </li>
        ))}
      </ul>
      <Link href={href} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
        {cta} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  )
}
