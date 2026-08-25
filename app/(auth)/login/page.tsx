import type { Metadata } from 'next'
import { db } from '@/db'
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

export default async function LoginPage() {
  const store = await db()
  const demoAccounts =
    process.env.SEED_DEMO_DATA === 'false'
      ? []
      : await (async () => {
          const [users, members, companies] = await Promise.all([
            store.select('users', { orderBy: { field: 'created_at' } }),
            store.select('company_members', {}),
            store.select('companies', {}),
          ])
          const seen = new Set<string>()
          return users
            .filter((user) => user.email.endsWith('.demo'))
            .map((user) => {
              const membership = members.find((m) => m.user_id === user.id)
              const company = companies.find((c) => c.id === membership?.company_id)
              return {
                email: user.email,
                name: user.full_name,
                role: user.role,
                company: company?.name ?? '',
                companyType: company?.type ?? 'borrower',
              }
            })
            // One representative account per organisation type keeps the list
            // short enough to be useful.
            .filter((account) => {
              if (seen.has(account.companyType)) return false
              seen.add(account.companyType)
              return true
            })
        })()

  // Offering a sign-in link this deployment cannot deliver is worse than not
  // offering one. In development the link is surfaced on screen instead.
  const emailLinkEnabled = mailConfigured() || process.env.NODE_ENV !== 'production'
  return <LoginForm demoAccounts={demoAccounts} emailLinkEnabled={emailLinkEnabled} />
}
