import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Building2, FileText, LineChart, Wallet } from 'lucide-react'
import { isAvailable } from '@/lib/flags'
import { Card, CardBody } from '@/components/ui/primitives'
import { StartDemo } from './start'

export const metadata: Metadata = {
  title: 'See the demo',
  description: 'Explore a full healthcare investment platform. No account, no email, nothing to install.',
}
export const dynamic = 'force-dynamic'

/**
 * The demonstration, without an account.
 *
 * The page's job is to get out of the way. Somebody who followed a link
 * offering a demonstration has already decided; making them read three
 * paragraphs and fill in a form loses most of them before the product gets a
 * chance to speak for itself.
 *
 * So: what it is, what they will be able to do, one button. The honest
 * limitations sit underneath, where somebody who wants them will find them and
 * somebody who does not is not delayed by them.
 */
export default async function TryPage() {
  if (!isAvailable('GUEST_DEMO_ENABLED')) notFound()

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          No account needed
        </p>
        <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink">
          See the whole platform,<br />without signing up.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-secondary">
          One press puts you inside a complete healthcare investment platform with $250,000 of
          virtual money. Browse the raises, read the financials, open the documents, ask questions
          about a deal, invest, and watch what it would pay you.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          Every property, operator and figure in the demonstration is invented. No email, no card,
          nothing to install, and nothing to cancel.
        </p>

        <div className="mt-7">
          <StartDemo />
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        <Feature
          icon={<Building2 className="size-4 text-accent" />}
          title="Fifteen portfolios across fifteen states"
          body="Fifty-three facilities, eight operators, each with a track record and a stated philosophy. Two of them are bad deals, on purpose."
        />
        <Feature
          icon={<FileText className="size-4 text-accent" />}
          title="Real documents behind every number"
          body="Operating statements, balance sheets, census, payer mix, appraisals. Every figure on a deal page was extracted from one of them."
        />
        <Feature
          icon={<Wallet className="size-4 text-accent" />}
          title="Invest, and watch what happens"
          body="Cash goes down, a holding appears, and a simulated quarter pays out through that raise's own waterfall."
        />
        <Feature
          icon={<LineChart className="size-4 text-accent" />}
          title="Change an assumption and see what breaks"
          body="Move occupancy, labour cost or the exit multiple, and watch the return move with it. The dial that moves it most is where the risk is."
        />
      </div>

      <div className="mt-12 border-t border-line pt-8">
        <h2 className="text-[15px] font-semibold text-ink">What the demonstration is not</h2>
        <ul className="mt-3 max-w-2xl space-y-2 text-[13px] leading-relaxed text-ink-secondary">
          <li>
            <strong className="font-medium text-ink">It is not real.</strong> Every property,
            operator, financial statement and document in it is fictional. Nothing corresponds to a
            real facility or a real raise.
          </li>
          <li>
            <strong className="font-medium text-ink">No money can move.</strong> The demonstration
            has no connection to any payment system — not one that is switched off, but none that
            exists. It cannot buy a security, create a commitment or contact a bank.
          </li>
          <li>
            <strong className="font-medium text-ink">It is not saved for long.</strong> A guest
            session lasts a few hours. When it expires the portfolio is gone, which is the right
            lifetime for something made by a click.
          </li>
        </ul>
        <p className="mt-5 text-[13px] text-ink-secondary">
          To practise against the <em>real</em> opportunities — still with virtual money, still with
          no obligation —{' '}
          <Link href="/signup?intent=invest" className="font-medium text-accent hover:underline">
            create an account
          </Link>
          . Real operators&rsquo; figures are released under a confidentiality agreement, and an
          agreement signed by a guest protects nobody.
        </p>
      </div>

      <p className="mt-10 max-w-2xl text-[11px] leading-relaxed text-ink-muted">
        CareCapital Exchange is not a broker-dealer, investment adviser, funding portal or
        custodian. It does not recommend investments and never holds or moves money. Figures shown
        in the demonstration are hypothetical, derived from assumptions attributed to fictional
        operators, and do not represent actual or achievable results.
      </p>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardBody className="space-y-1.5">
        {icon}
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
      </CardBody>
    </Card>
  )
}
