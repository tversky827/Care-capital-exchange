import { redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/primitives'
import { ProfileForm } from './form'

export const dynamic = 'force-dynamic'

export default async function InvestorProfilePage() {
  const actor = await requireActor()
  if (!actor.investor) redirect('/investor/onboarding')

  const store = await db()
  const [preferences, verifications] = await Promise.all([
    store.selectOne('investor_preferences', { where: { investor_id: actor.investor.id } }),
    store.select('investor_verifications', { where: { investor_id: actor.investor.id } }),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow={actor.company.name}
        title="Investor profile"
        description="Your preferences decide which offerings you are shown. Your verification status decides which you can participate in."
      />
      <ProfileForm profile={actor.investor} preferences={preferences} verifications={verifications} />
    </div>
  )
}
