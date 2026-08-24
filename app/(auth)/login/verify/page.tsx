import Link from 'next/link'
import type { Metadata } from 'next'
import { Alert, Button, Card } from '@/components/ui/primitives'
import { verifyMagicLinkAction } from '../../actions'

export const metadata: Metadata = { title: 'Verifying sign-in link' }

/**
 * Consuming the link is a mutation, so it happens in a server action triggered
 * by an explicit confirmation rather than on render — a prefetch or a link
 * scanner must not be able to burn a sign-in token.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const params = await searchParams
  const token = params.token

  if (!token) {
    return (
      <Card className="w-full max-w-md p-6">
        <Alert tone="critical" title="No sign-in token">
          This link is missing its token. Request a new one from the sign-in page.
        </Alert>
        <Link href="/login" className="mt-4 block">
          <Button variant="primary" className="w-full">Back to sign in</Button>
        </Link>
      </Card>
    )
  }

  async function confirm() {
    'use server'
    const result = await verifyMagicLinkAction(token!)
    if (result?.error) {
      const { redirect } = await import('next/navigation')
      redirect(`/login/verify?error=${encodeURIComponent(result.error)}`)
    }
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-[18px] font-semibold text-ink">Confirm sign-in</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
        Confirm below to complete sign-in with this link.
      </p>
      {params.error ? <Alert tone="critical" className="mt-4">{params.error}</Alert> : null}
      <form action={confirm} className="mt-5">
        <Button type="submit" variant="primary" className="w-full">Sign me in</Button>
      </form>
      <Link href="/login" className="mt-3 block text-center text-[12px] text-ink-muted hover:text-ink">
        Use a different method
      </Link>
    </Card>
  )
}
