import Link from 'next/link'
import type { Metadata } from 'next'
import { requireActor } from '@/lib/auth/session'
import { allLenders, publicProfile } from '@/services/lenders'
import { Badge, Card, CardBody, EmptyState, PageHeader } from '@/components/ui/primitives'
import { formatCurrency, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Lender directory' }

/**
 * Lender directory.
 *
 * Shows only what each institution has chosen to publish, projected through the
 * same function the platform uses everywhere else. A lender browsing here sees
 * no more than a borrower does.
 */
export default async function LenderDirectoryPage() {
  await requireActor()
  const lenders = (await allLenders()).filter(({ lender }) => lender.verification_status === 'verified')

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Capital partners"
        title="Lender directory"
        description="Verified institutions active on the platform. Each shows only the criteria it has chosen to publish; the rest is used for matching but never disclosed."
      />

      {lenders.length === 0 ? (
        <Card><EmptyState title="No verified lenders yet" /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lenders.map(({ lender, box }) => {
            const profile = publicProfile(lender, box)
            return (
              <Card key={lender.id} className="flex flex-col">
                <div className="flex items-start gap-3 border-b border-line px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center bg-accent text-[12px] font-semibold text-white rounded-[2px]">
                    {profile.logo_initials}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/lenders/${lender.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-accent hover:underline">
                      {profile.institution_name}
                    </Link>
                    <p className="text-[11px] text-ink-muted">{titleize(profile.institution_type)}</p>
                  </div>
                </div>

                <CardBody className="flex-1 space-y-2">
                  {profile.description ? (
                    <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-secondary">{profile.description}</p>
                  ) : (
                    <p className="text-[12px] italic text-ink-muted">This institution has not published a description.</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {profile.asset_types.slice(0, 4).map((type) => (
                      <Badge key={type} tone="neutral">{titleize(type)}</Badge>
                    ))}
                  </div>
                </CardBody>

                <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
                  {profile.loan_range?.min && profile.loan_range.max
                    ? `${formatCurrency(profile.loan_range.min, { compact: true })} – ${formatCurrency(profile.loan_range.max, { compact: true })}`
                    : 'Loan range not published'}
                  {profile.states.length ? ` · ${profile.states.slice(0, 6).join(', ')}${profile.states.length > 6 ? '…' : ''}` : ''}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
