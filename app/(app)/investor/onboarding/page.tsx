import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { db } from '@/db'
import { isAvailable } from '@/lib/flags'
import { Alert, PageHeader } from '@/components/ui/primitives'
import { ONBOARDING_STAGES, stageNumber } from '@/services/equity/investors'
import { OnboardingWizard } from './wizard'

export const dynamic = 'force-dynamic'

/**
 * Investor onboarding.
 *
 * Nine steps, and the order is not arbitrary: who you are, what you have done,
 * what you look for, what risk you accept, what you assert about your
 * eligibility, then the checks that test those assertions, then what you are
 * agreeing to. Verification comes after the assertions so an investor sees
 * what is being verified before it is.
 */
export default async function OnboardingPage() {
  const actor = await requireActor()
  if (!isAvailable('INVESTOR_ONBOARDING_ENABLED')) {
    return <Alert tone="neutral" title="Investor onboarding is not enabled">This deployment is configured for debt financing only.</Alert>
  }
  if (actor.investor?.onboarding_stage === 'complete') redirect('/investor/dashboard')

  const store = await db()
  const [preferences, verifications] = actor.investor
    ? await Promise.all([
      store.selectOne('investor_preferences', { where: { investor_id: actor.investor.id } }),
      store.select('investor_verifications', { where: { investor_id: actor.investor.id } }),
    ])
    : [null, []]

  const stage = actor.investor?.onboarding_stage ?? 'profile'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        eyebrow={`Step ${stageNumber(stage)} of ${ONBOARDING_STAGES.length - 1}`}
        title="Investor onboarding"
        description="Private investments are restricted. What you provide here determines which offerings you can be shown and whether you can participate in them."
      />
      <OnboardingWizard
        stage={stage}
        profile={actor.investor}
        preferences={preferences}
        verifications={verifications}
      />
    </div>
  )
}
