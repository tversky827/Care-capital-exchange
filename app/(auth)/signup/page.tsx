import type { Metadata } from 'next'
import { SignupForm } from './signup-form'
import { debtMarketplaceEnabled } from '@/lib/product'

export const metadata: Metadata = { title: 'Create an account' }

/**
 * The chosen intent decides which workspace the account gets, so the default
 * has to match what this deployment actually sells: investing where the product
 * is the investment marketplace, raising where it is not reachable any other
 * way. An intent this deployment does not offer falls back rather than creating
 * an account with nowhere to go.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const params = await searchParams
  const debtMarketplace = debtMarketplaceEnabled()
  const offered = debtMarketplace
    ? ['invest', 'find_financing', 'provide_financing', 'manage_for_clients']
    : ['invest', 'find_financing']
  const requested = params.intent ?? ''
  const intent = offered.includes(requested)
    ? (requested as 'invest' | 'find_financing' | 'provide_financing' | 'manage_for_clients')
    : 'invest'

  return <SignupForm initialIntent={intent} debtMarketplace={debtMarketplace} />
}
