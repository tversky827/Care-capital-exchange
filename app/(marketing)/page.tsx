import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

/**
 * Homepage.
 *
 * One idea, said once: you can put money into a nursing home, and you can see
 * everything about it before you do. The example offering is the centrepiece —
 * showing a real listing communicates the product far better than describing
 * it, and its figures are the ones the demo data actually produces.
 *
 * Nothing here promises a return. Every forward-looking figure on this page is
 * labelled a target or a projection at the point it appears, not only in the
 * footer, because a figure and its caveat have to travel together.
 */

const EXAMPLE = {
  name: 'Lakeview Skilled Nursing Equity',
  facility: '120-bed skilled nursing facility',
  state: 'Illinois',
  raise: 3_500_000,
  minimum: 50_000,
  targetReturn: 28.9,
  holdYears: 5,
  raisedPct: 37,
}

const STEPS = [
  { label: 'Browse', detail: 'Every open raise, with what it targets, what it takes to join, and how much is left.' },
  { label: 'Read', detail: 'The operator’s own statements, the projections and the assumptions behind them, and a plain account of what could go wrong.' },
  { label: 'Ask', detail: 'Question the record and get an answer with the document it came from — or send the question to the operator.' },
  { label: 'Commit', detail: 'Tell the operator what you intend to invest. They take it from there. No money moves through us.' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-xl">
            <Badge tone="accent" className="mb-5">Skilled nursing · Senior housing · Behavioural health</Badge>
            <h1 className="text-[38px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink lg:text-[46px]">
              Invest in the buildings<br />that care for people.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-secondary">
              Private investments in healthcare property, offered by the operators who run them.
              You see the same figures the operator filed — the statements, the projections, the
              assumptions underneath, and what could go wrong — before you decide anything.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup?intent=invest">
                <Button variant="primary" size="lg" className="gap-2">
                  Browse investments <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/for-borrowers">
                <Button size="lg">I run a facility</Button>
              </Link>
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-ink-muted">
              Private investments are illiquid, returns are projected rather than promised, and you
              can lose everything you invest.
            </p>
          </div>

          {/* Example offering --------------------------------------------- */}
          <Card className="self-start">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="eyebrow">Example listing</span>
              <Badge tone="warning">Illustrative — fictional</Badge>
            </div>
            <div className="border-b border-line px-4 py-3">
              <p className="text-[15px] font-semibold text-ink">{EXAMPLE.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {EXAMPLE.state} · {EXAMPLE.facility}
              </p>
            </div>
            <dl className="data-grid grid-cols-2">
              <ExampleCell
                label="Target return"
                value={formatPercent(EXAMPLE.targetReturn)}
                hint="a year, projected"
              />
              <ExampleCell
                label="Minimum"
                value={formatCurrency(EXAMPLE.minimum, { compact: true })}
                hint="to take part"
              />
              <ExampleCell
                label="Money is tied up"
                value={`${EXAMPLE.holdYears} years`}
                hint="target, could be longer"
              />
              <ExampleCell
                label="Raising"
                value={formatCurrency(EXAMPLE.raise, { compact: true })}
                hint={`${EXAMPLE.raisedPct}% committed`}
              />
            </dl>
            <div className="px-4 py-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${EXAMPLE.raisedPct}%` }} />
              </div>
            </div>
            <p className="border-t border-line bg-surface-sunken px-4 py-2 text-[11px] leading-relaxed text-ink-muted">
              A target return is what the operator&rsquo;s own assumptions produce when the model is
              run. It is not a forecast, and nobody has promised it.
            </p>
          </Card>
        </div>
      </section>

      {/* How it goes ------------------------------------------------------ */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-px border border-line bg-line md:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.label} className="bg-surface p-5">
                <span className="tnum text-[11px] font-semibold text-ink-muted">0{index + 1}</span>
                <p className="mt-2 text-[14px] font-semibold uppercase tracking-[0.04em] text-ink">{step.label}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can see ------------------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow">What makes this different</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
              A nursing home is an operating business wearing a building.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">
              Which means the things that decide whether you get your money back are not the things
              that decide it for an apartment block. Who pays for the care, how full the beds are,
              what the staffing costs, and what a state legislature does to the reimbursement rate.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-secondary">
              Every listing here is underwritten against those figures, from the operator&rsquo;s
              own documents, by code that shows its working. You can open any number and see where
              it came from.
            </p>
          </div>
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            {[
              { title: 'Who actually pays', body: 'Medicaid rates are set by the state, not the operator. A facility that is 80% Medicaid has a different risk than one that is 30%, and you are told which this is.' },
              { title: 'Earnings that move', body: 'Census and agency staffing move profit quickly. Projections are run against a stabilised view, not the best quarter the operator ever had.' },
              { title: 'Documents that disagree', body: 'Statements, tax returns and census reports rarely reconcile perfectly. Where they conflict, both figures are shown with their sources rather than one quietly winning.' },
              { title: 'The downside, written down', body: 'Every listing carries a risk score computed from its own figures, the reasoning behind each part of it, and a modelled case for what happens if it goes badly.' },
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
            eyebrow="If you want to invest"
            title="See everything before you decide anything."
            points={[
              'Browse open raises with what they target and what they cost to join.',
              'Read the operator’s own statements, not a summary of them.',
              'Model any amount and see what it would be projected to return.',
              'Ask a question and get the document the answer came from.',
            ]}
            href="/how-it-works"
            cta="How investing works"
          />
          <AudienceCard
            eyebrow="If you run a facility"
            title="Raise from investors who want what you have."
            points={[
              'Put up one property and one set of terms.',
              'Your figures are underwritten once and shown consistently.',
              'Reach investors whose stated preferences match your raise.',
              'See who is interested and what they have committed, in one place.',
            ]}
            href="/for-borrowers"
            cta="How raising works"
          />
        </div>
      </section>

      {/* What we are not --------------------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="eyebrow">What CareCapital Exchange is not</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
              We do not sell you anything, and we never hold your money.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">
              This is a place to read about private healthcare investments and tell an operator you
              are interested. It is not a broker, not an adviser, and not a custodian.
            </p>
          </div>
          <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-3">
            {[
              { title: 'We do not recommend', body: 'Nothing here is a recommendation to invest, and no listing is ranked by who is paying. What you see is what the operator filed, arranged the same way for every raise.' },
              { title: 'We do not move money', body: 'A commitment records what you intend to invest and sends it to the operator. Any actual transaction happens between you and them, with their counsel and yours.' },
              { title: 'We do not invent numbers', body: 'If a figure is not in the operator’s documents, you are told the record is silent rather than given an estimate. A blank is honest; a plausible guess is not.' },
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
              { q: 'Can I get my money back if I change my mind?', a: 'Not easily, and you should assume not at all. These are private investments with no market to sell them in. Your capital should be treated as committed for the whole of the stated hold period, and the hold period is a target rather than a deadline — it can run longer.' },
              { q: 'Is the target return a promise?', a: 'No. It is what the operator’s stated assumptions produce when the projection is run. Change any assumption — occupancy, rates, the price the building sells for years from now — and the number changes. Actual results will differ, and can differ substantially. You can open every assumption behind any figure on a listing.' },
              { q: 'Who decides what appears here?', a: 'An operator submits a property and its terms, and an administrator reviews the disclosure package before it can be published. Review means the required material is present and consistent — it is not an endorsement, and it is not a judgement about whether the investment is a good one.' },
              { q: 'Does CareCapital take my money?', a: 'No. No money moves through this platform. A commitment is a stated intention that is sent to the operator; anything that follows happens directly between you and them.' },
              { q: 'Who can invest?', a: 'That depends on the offering. Most are open only to accredited investors, and each listing shows the requirements it places on you and which of them you currently meet before you can commit to it.' },
              { q: 'What do you do with my documents?', a: 'They are stored encrypted at rest, served only through authorized, expiring links, and every view and download is logged. Operators control which documents are released and to whom.' },
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
              Have a look at what is open.
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-secondary">
              Sign in to the demonstration environment with a seeded account, or create your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup?intent=invest">
              <Button variant="primary" size="lg">Browse investments</Button>
            </Link>
            <Link href="/signup?intent=find_financing">
              <Button size="lg">Raise for my facility</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

function ExampleCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-2.5">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
      {hint ? <dd className="text-[11px] text-ink-muted">{hint}</dd> : null}
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
