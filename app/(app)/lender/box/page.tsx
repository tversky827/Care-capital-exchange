import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { Alert, Card, CardBody, Section } from '@/components/ui/primitives'
import { LendingBoxForm } from './form'
import { ASSET_TYPES, TRANSACTION_TYPES } from '@/types'

export const metadata: Metadata = { title: 'Lending box' }

/**
 * The lending box is the contract a lender publishes to the platform. It drives
 * matching, distribution eligibility and alerts, so it is the single most
 * valuable thing a new lender can complete.
 */
export default async function LendingBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const actor = await requireActor()
  if (!actor.isLender) redirect(actor.isAdmin ? '/admin' : '/dashboard')
  const lender = actor.lender
  if (!lender) redirect('/lender')

  const { welcome } = await searchParams
  const store = await db()
  const box = await store.selectOne('lender_lending_boxes', { where: { lender_id: lender.id } })

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <p className="eyebrow">{lender.institution_name}</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Lending box</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-secondary">
          These criteria are what the platform screens every opportunity against. Boundaries — loan
          size, maximum LTV, minimum DSCR, states, asset and transaction types — disqualify a deal
          outright. Preferences flag a concern without excluding it.
        </p>
      </div>

      {welcome ? (
        <Alert tone="accent" title="Welcome — start here">
          Publishing your criteria is what turns this platform on for your institution. Until they are
          set, the platform cannot screen opportunities for you and borrowers cannot see whether you
          are a fit.
        </Alert>
      ) : null}

      {lender.verification_status !== 'verified' ? (
        <Alert tone="warning" title={`Verification ${lender.verification_status}`}>
          You can define your criteria now. Opportunities begin flowing once a platform administrator
          verifies your institution.
        </Alert>
      ) : null}

      <Section title="Criteria">
        <CardBody>
          <LendingBoxForm
            box={box}
            assetTypes={[...ASSET_TYPES]}
            transactionTypes={[...TRANSACTION_TYPES]}
          />
        </CardBody>
      </Section>

      <Card>
        <CardBody>
          <p className="eyebrow mb-2">How each field is used</p>
          <dl className="space-y-2 text-[12px] leading-relaxed text-ink-secondary">
            <div><dt className="inline font-medium text-ink">Loan size, states, asset and transaction types, maximum LTV, minimum DSCR — </dt><dd className="inline">hard boundaries. A deal outside any of them is reported to the borrower as outside your stated criteria and is never sent to you.</dd></div>
            <div><dt className="inline font-medium text-ink">Debt yield, occupancy, payer mix, operator experience — </dt><dd className="inline">preferences. A deal that misses one is flagged as a concern to both sides, not excluded.</dd></div>
            <div><dt className="inline font-medium text-ink">Preferred deal size — </dt><dd className="inline">deals near your typical check size score higher than deals at the edge of your range.</dd></div>
            <div><dt className="inline font-medium text-ink">Required documents — </dt><dd className="inline">borrowers are asked for these before distribution, and only when a lender in the group actually requires them.</dd></div>
            <div><dt className="inline font-medium text-ink">Typical rate and term — </dt><dd className="inline">shown on your public profile if you publish it, and used to pre-fill your indication form. Never used to compare you against another lender.</dd></div>
          </dl>
        </CardBody>
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
