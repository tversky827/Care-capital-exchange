import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/session'
import { isEnabled } from '@/lib/flags'
import { db } from '@/db'
import { TopBar } from '@/components/shell/topbar'
import { MobileNav, Sidebar } from '@/components/shell/sidebar'
import type { NavRole } from '@/components/shell/nav-config'
import { DemoBanner } from '@/components/brand'

/**
 * Authenticated shell.
 *
 * Navigation is chosen from the actor's organisation type — a lender never sees
 * borrower routes in the chrome, and vice versa. Route-level authorization is
 * still enforced in each page and service; this only shapes what is offered.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect('/login')

  const role: NavRole = actor.isAdmin
    ? 'admin'
    : actor.isLender ? 'lender' : actor.isInvestor ? 'investor' : 'borrower'

  const debtMarketplace = isEnabled('DEBT_MARKETPLACE_ENABLED')

  const store = await db()
  const demoDeals = await store.count('deals', { where: { is_demo: true } })

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={role} debtMarketplace={debtMarketplace} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar actor={actor} />
        {demoDeals > 0 ? <DemoBanner className="no-print" /> : null}
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
        {/* Last in the flow: on a phone this is a bar fixed to the bottom of
            the viewport, and the spacer it renders has to follow the content
            it is keeping clear. */}
        <MobileNav role={role} debtMarketplace={debtMarketplace} />
      </div>
    </div>
  )
}
