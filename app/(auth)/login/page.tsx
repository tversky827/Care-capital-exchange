import type { Metadata } from 'next'
import { db } from '@/db'
import { debtMarketplaceEnabled } from '@/lib/product'
import { LoginForm } from './login-form'
import { mailConfigured } from '@/services/email'

export const metadata: Metadata = { title: 'Sign in' }

/**
 * The demo account list is read from the database rather than hard-coded, so
 * it disappears automatically when demo seeding is turned off.
 *
 * Rendered per request rather than prerendered. This page reads both the
 * database and the environment, so prerendering it would freeze the build
 * machine's answers into the HTML — a deployment that turns demo sign-in off,
 * or configures mail after the build, would still be served the state that was
 * true when the bundle was compiled.
 */
export const dynamic = 'force-dynamic'

/**
 * Which demonstration accounts are offered, and in what order.
 *
 * Read from the database rather than hard-coded, so the list disappears by
 * itself when demo seeding is off. Ordered by what a visitor should look at
 * first: the investor side is the product, the operator side is how a raise
 * gets there, and the administrator console is the machinery behind both.
 *
 * An account for a workspace this deployment does not run is not offered —
 * signing in as one would land on a 404.
 */
const DEMO_ORDER: { type: string; label: string; blurb: string; debtOnly?: boolean }[] = [
  {
    type: 'investor',
    label: 'Investor',
    blurb: 'Browse open raises, sign an NDA, model a cheque, and see a portfolio with distributions already paid.',
  },
  {
    type: 'borrower',
    label: 'Operator',
    blurb: 'Four properties, three raises open, investors committed and waiting on a decision.',
  },
  {
    type: 'admin',
    label: 'Administrator',
    blurb: 'Every raise, every company, the AI review queue, the audit log and the fee ledger.',
  },
  { type: 'lender', label: 'Lender', blurb: 'The debt side of the marketplace.', debtOnly: true },
]

export default async function LoginPage() {
  const store = await db()
  const debtMarketplace = debtMarketplaceEnabled()
  const demoAccounts =
    process.env.SEED_DEMO_DATA === 'false'
      ? []
      : await (async () => {
          const [users, members, companies] = await Promise.all([
            store.select('users', { orderBy: { field: 'created_at' } }),
            store.select('company_members', {}),
            store.select('companies', {}),
          ])
          const byType = new Map<string, { email: string; name: string; company: string }>()
          for (const user of users) {
            if (!user.email.endsWith('.demo')) continue
            const membership = members.find((m) => m.user_id === user.id)
            const company = companies.find((c) => c.id === membership?.company_id)
            if (!company || byType.has(company.type)) continue
            byType.set(company.type, { email: user.email, name: user.full_name, company: company.name })
          }
          return DEMO_ORDER.flatMap((entry) => {
            if (entry.debtOnly && !debtMarketplace) return []
            const account = byType.get(entry.type)
            if (!account) return []
            return [{ ...account, companyType: entry.type, label: entry.label, blurb: entry.blurb }]
          })
        })()

  // Offering a sign-in link this deployment cannot deliver is worse than not
  // offering one. In development the link is surfaced on screen instead.
  const emailLinkEnabled = mailConfigured() || process.env.NODE_ENV !== 'production'
  return <LoginForm demoAccounts={demoAccounts} emailLinkEnabled={emailLinkEnabled} />
}
