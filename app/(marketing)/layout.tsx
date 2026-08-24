import Link from 'next/link'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/primitives'
import { getActor } from '@/lib/auth/session'

const NAV = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/for-borrowers', label: 'For borrowers' },
  { href: '/for-lenders', label: 'For lenders' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
]

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
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
          <div className="ml-auto flex items-center gap-2">
            {actor ? (
              <Link href={actor.isLender ? '/lender' : actor.isAdmin ? '/admin' : '/dashboard'}>
                <Button variant="primary" size="sm">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/signup">
                  <Button variant="primary" size="sm">Submit a deal</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-ink-muted">
                Healthcare capital, intelligently matched. An institutional financing platform for
                skilled nursing and the wider healthcare sector.
              </p>
            </div>
            <FooterColumn
              title="Product"
              links={[
                { href: '/how-it-works', label: 'How it works' },
                { href: '/for-borrowers', label: 'For borrowers' },
                { href: '/for-lenders', label: 'For lenders' },
                { href: '/pricing', label: 'Pricing' },
              ]}
            />
            <FooterColumn
              title="Company"
              links={[
                { href: '/about', label: 'About' },
                { href: '/contact', label: 'Contact' },
              ]}
            />
            <FooterColumn
              title="Access"
              links={[
                { href: '/login', label: 'Sign in' },
                { href: '/signup', label: 'Create an account' },
              ]}
            />
          </div>

          <div className="mt-10 border-t border-line pt-6">
            <p className="max-w-4xl text-[11px] leading-relaxed text-ink-muted">
              CareCapital Exchange facilitates connections between healthcare operators seeking
              financing and lenders. It does not originate, approve, underwrite for its own account,
              guarantee or commit to any loan, and nothing on this platform is an offer of credit.
              Financing indications submitted through the platform are indications of interest, not
              commitments to lend. Nothing here is legal, tax, accounting or investment advice.
              All figures, companies, facilities and institutions shown in the product demonstration
              are fictional.
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

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[12px] text-ink-secondary transition-colors hover:text-ink">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
