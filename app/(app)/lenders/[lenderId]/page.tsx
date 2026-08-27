import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { lenderById, publicProfile } from '@/services/lenders'
import { Alert, Badge, Card, CardBody, DefinitionList, PageHeader, Section } from '@/components/ui/primitives'
import { formatCurrency, titleize } from '@/lib/utils/format'
import { requireDebtMarketplace } from '@/lib/product'

/**
 * Public lender profile.
 *
 * Rendered entirely from `publicProfile`, so a field the lender did not publish
 * cannot leak here even by accident — the projection is the boundary, not the
 * template.
 */
export default async function LenderProfilePage({ params }: { params: Promise<{ lenderId: string }> }) {
  requireDebtMarketplace()
  const { lenderId } = await params
  await requireActor()

  const record = await lenderById(lenderId)
  if (!record || record.lender.verification_status !== 'verified') notFound()

  const profile = publicProfile(record.lender, record.box)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        eyebrow={titleize(profile.institution_type)}
        title={profile.institution_name}
        description={profile.description ?? 'This institution has not published a description.'}
      />

      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <Badge tone="positive">Verified</Badge>
            <span className="text-[12px] text-ink-muted">
              Verified by a platform administrator before receiving borrower opportunities.
            </span>
          </div>
        </CardBody>
      </Card>

      <Section title="Published lending criteria">
        <CardBody>
          <DefinitionList
            columns={2}
            items={[
              { label: 'Asset classes', value: profile.asset_types.length ? profile.asset_types.map(titleize).join(', ') : 'Not published' },
              { label: 'Geographies', value: profile.states.length ? profile.states.join(', ') : 'Not published' },
              {
                label: 'Typical loan size',
                value: profile.loan_range?.min && profile.loan_range.max
                  ? `${formatCurrency(profile.loan_range.min, { compact: true })} – ${formatCurrency(profile.loan_range.max, { compact: true })}`
                  : 'Not published',
              },
              { label: 'Transaction types', value: profile.transaction_types.length ? profile.transaction_types.map(titleize).join(', ') : 'Not published' },
              {
                label: 'Typical pricing',
                value: profile.typical_rate?.low ? `${profile.typical_rate.low}% – ${profile.typical_rate.high}%` : 'Not published',
              },
              {
                label: 'Typical term',
                value: profile.typical_term_months ? `${Math.round(profile.typical_term_months / 12)} years` : 'Not published',
              },
            ]}
          />
        </CardBody>
      </Section>

      <Section title="Contact">
        <CardBody>
          {profile.contact?.email ? (
            <p className="text-[13px] text-ink-secondary">
              {profile.contact.name ? `${profile.contact.name} · ` : ''}
              {profile.contact.email}
            </p>
          ) : (
            <Alert tone="neutral">
              This institution routes contact through the platform. Distribute a deal to them, or open a
              question thread from the deal, and the conversation is carried here — neither side&apos;s
              direct contact details are exchanged.
            </Alert>
          )}
        </CardBody>
      </Section>

      <p className="text-[11px] leading-relaxed text-ink-muted">
        Criteria shown are those this institution has chosen to publish. A deal matching them is not an
        indication that this lender will offer financing; every lender reaches its own credit
        conclusion.
      </p>
    </div>
  )
}

export const dynamic = 'force-dynamic'
