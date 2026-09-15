import Link from 'next/link'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/primitives'
import { getActor } from '@/lib/auth/session'

const NAV = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/for-borrowers', label: 'For operators' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  // Not "See the demo": the button two inches to the right already says that,
  // and a nav link competing with the primary action makes neither one read.
]

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:gap-8 sm:px-6">
          <Logo />
          <nav className="hidden flex-1 items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-ink-secondary transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {/* `whitespace-nowrap` because "See the demo" wrapped to two lines
              inside a 28px-tall button at 390px wide, and a two-line button is
              the first thing a visitor sees. */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actor ? (
              <Link href={actor.isLender ? '/lender' : actor.isAdmin ? '/admin' : actor.isInvestor ? '/investments' : '/deals'}>
                <Button variant="primary" size="sm" className="whitespace-nowrap">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm" className="whitespace-nowrap">Sign in</Button>
                </Link>
                <Link href="/try">
                  <Button variant="primary" size="sm" className="whitespace-nowrap">
                    <span className="sm:hidden">Demo</span>
                    <span className="hidden sm:inline">See the demo</span>
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* One row of links and the legal text. The four-column grid this
          replaced stacked into four full-width blocks on a phone, which put
          roughly a screen and a half of navigation under every page. */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Logo />
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { href: '/try', label: 'See the demo' },
                { href: '/how-it-works', label: 'How it works' },
                { href: '/for-borrowers', label: 'For operators' },
                { href: '/pricing', label: 'Pricing' },
                { href: '/about', label: 'About' },
                { href: '/contact', label: 'Contact' },
                { href: '/login', label: 'Sign in' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[12px] text-ink-secondary hover:text-ink"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-7 border-t border-line pt-5">
            <p className="max-w-4xl text-[11px] leading-relaxed text-ink-muted">
              CareCapital Exchange connects healthcare operators raising capital with investors
              considering it. It is not a broker-dealer, investment adviser, funding portal or
              custodian; it does not recommend investments, hold investor money, or effect
              securities transactions. Everything shown about an investment comes from the
              operator&rsquo;s own submission. Private investments are illiquid, forward-looking
              figures are projections rather than forecasts or promises, and an investor can lose
              their entire investment. Nothing here is legal, tax, accounting or investment advice.
              All figures, companies, facilities and institutions shown in the product
              demonstration are fictional.
            </p>
            <p className="mt-4 text-[11px] text-ink-muted">
              © {new Date().getFullYear()} CareCapital Exchange.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
