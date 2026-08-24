import type { Metadata } from 'next'
import { db } from '@/db'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

/**
 * The demo account list is read from the database rather than hard-coded, so
 * it disappears automatically when demo seeding is turned off.
 */
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

  return <LoginForm demoAccounts={demoAccounts} />
}
