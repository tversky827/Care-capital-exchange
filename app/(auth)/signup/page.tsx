import type { Metadata } from 'next'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create an account' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const params = await searchParams
  const intent =
    params.intent === 'provide_financing' || params.intent === 'manage_for_clients'
      ? params.intent
      : 'find_financing'
  return <SignupForm initialIntent={intent} />
}
