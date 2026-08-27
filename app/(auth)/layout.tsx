import Link from 'next/link'
import { Logo } from '@/components/brand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Logo />
          <Link href="/" className="text-[13px] text-ink-secondary hover:text-ink">
            Back to site
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 py-12">{children}</main>
      <footer className="border-t border-line bg-surface px-6 py-4">
        <p className="mx-auto max-w-7xl text-[11px] leading-relaxed text-ink-muted">
          CareCapital Exchange is not a broker-dealer, investment adviser, funding portal or
          custodian. It does not recommend investments and never holds or moves money.
        </p>
      </footer>
    </div>
  )
}
