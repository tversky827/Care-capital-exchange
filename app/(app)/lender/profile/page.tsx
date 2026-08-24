import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { publicProfile } from '@/services/lenders'
import { Alert, Badge, CardBody, Section } from '@/components/ui/primitives'
import { ProfileForm } from './form'
import { formatCurrency, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Institution profile' }

/**
 * Lender profile.
 *
 * A lender controls exactly which fields borrowers see. The preview renders the
 * profile through the same `publicProfile` projection the borrower-facing page
 * uses, so what is shown here is literally what a borrower would get.
 */
export default async function LenderProfilePage() {
  const actor = await requireActor()
  if (!actor.isLender) redirect(actor.isAdmin ? '/admin' : '/dashboard')
  const lender = actor.lender
  if (!lender) redirect('/lender')

  const store = await db()
  const box = await store.selectOne('lender_lending_boxes', { where: { lender_id: lender.id } })
  const preview = publicProfile(lender, box)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <p className="eyebrow">Institution</p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">{lender.institution_name}</h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={lender.verification_status === 'verified' ? 'positive' : lender.verification_status === 'rejected' ? 'critical' : 'warning'}>
            {titleize(lender.verification_status)}
          </Badge>
          <span className="text-[12px] text-ink-muted">{titleize(lender.institution_type)}</span>
        </div>
      </div>

      <Alert tone="neutral" title="You control what borrowers see">
        Nothing about your lending strategy is public by default. Tick only the fields you want on
        your borrower-facing profile — everything else stays internal, including any criteria you do
        not publish.
      </Alert>

      <Section title="Profile">
        <CardBody>
          <ProfileForm lender={{
            institution_name: lender.institution_name,
            institution_type: lender.institution_type,
            description: lender.description,
            contact_name: lender.contact_name,
            contact_email: lender.contact_email,
            contact_phone: lender.contact_phone,
            public_profile_fields: lender.public_profile_fields,
          }} />
        </CardBody>
      </Section>

      <Section title="Borrower-facing preview" description="Exactly what a borrower sees on your public profile.">
        <CardBody>
          <div className="border border-line p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center bg-accent text-[13px] font-semibold text-white rounded-[2px]">
                {preview.logo_initials}
              </span>
              <div>
                <p className="text-[15px] font-semibold text-ink">{preview.institution_name}</p>
                <p className="text-[12px] text-ink-muted">{titleize(preview.institution_type)}</p>
              </div>
            </div>

            {preview.description ? (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">{preview.description}</p>
            ) : (
              <p className="mt-3 text-[12px] italic text-ink-muted">Description not published.</p>
            )}

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
              <PreviewRow label="Asset classes" value={preview.asset_types.length ? preview.asset_types.map(titleize).join(', ') : 'Not published'} />
              <PreviewRow label="Geographies" value={preview.states.length ? preview.states.join(', ') : 'Not published'} />
              <PreviewRow
                label="Typical loan size"
                value={preview.loan_range?.min && preview.loan_range.max
                  ? `${formatCurrency(preview.loan_range.min, { compact: true })} – ${formatCurrency(preview.loan_range.max, { compact: true })}`
                  : 'Not published'}
              />
              <PreviewRow label="Transaction types" value={preview.transaction_types.length ? preview.transaction_types.map(titleize).join(', ') : 'Not published'} />
              <PreviewRow
                label="Typical pricing"
                value={preview.typical_rate?.low ? `${preview.typical_rate.low}% – ${preview.typical_rate.high}%` : 'Not published'}
              />
              <PreviewRow
                label="Typical term"
                value={preview.typical_term_months ? `${Math.round(preview.typical_term_months / 12)} years` : 'Not published'}
              />
              <PreviewRow
                label="Contact"
                value={preview.contact?.email ?? 'Routed through the platform'}
              />
            </dl>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Criteria you do not publish — minimum DSCR, debt yield floor, payer concentration limits,
            operator requirements — are still used for matching. They are simply never disclosed.
          </p>
        </CardBody>
      </Section>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line pb-1.5">
      <dt className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  )
}

export const dynamic = 'force-dynamic'
