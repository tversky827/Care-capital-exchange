import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth/session'
import { allLenders } from '@/services/lenders'
import { db } from '@/db'
import { Badge, Card, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { VerificationControl } from './verification-control'
import { formatCurrency, formatDate, titleize } from '@/lib/utils/format'
import { requireDebtMarketplace } from '@/lib/product'

export const metadata: Metadata = { title: 'Lender verification' }

/**
 * Lender verification.
 *
 * Verification is the gate on the whole lender side: an unverified institution
 * sees no deal, no document and no borrower identity. This screen shows enough
 * to make that decision, including what the institution has published.
 */
export default async function AdminLendersPage() {
  requireDebtMarketplace()
  await requireAdmin()
  const [lenders, store] = await Promise.all([allLenders(), db()])

  const [companies, distributions, indications] = await Promise.all([
    store.select('companies', {}),
    store.select('deal_distributions', {}),
    store.select('indications', {}),
  ])

  const pending = lenders.filter(({ lender }) => lender.verification_status === 'pending')
  const others = lenders.filter(({ lender }) => lender.verification_status !== 'pending')

  const renderRow = ({ lender, box }: (typeof lenders)[number]) => {
    const company = companies.find((entry) => entry.id === lender.company_id)
    const sent = distributions.filter((entry) => entry.lender_id === lender.id).length
    const submitted = indications.filter((entry) => entry.lender_id === lender.id).length
    return (
      <Tr key={lender.id}>
        <Td>
          <span className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center bg-accent text-[10px] font-semibold text-white rounded-[2px]">
              {lender.logo_initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{lender.institution_name}</span>
              <span className="block truncate text-[11px] text-ink-muted">{company?.name}</span>
            </span>
          </span>
        </Td>
        <Td className="text-ink-secondary">{titleize(lender.institution_type)}</Td>
        <Td className="text-[12px] text-ink-secondary">
          {box ? (
            <>
              {box.min_loan && box.max_loan
                ? `${formatCurrency(box.min_loan, { compact: true })}–${formatCurrency(box.max_loan, { compact: true })}`
                : 'No size range'}
              {box.states.length ? ` · ${box.states.slice(0, 5).join(', ')}${box.states.length > 5 ? '…' : ''}` : ' · nationwide'}
            </>
          ) : (
            <span className="text-warning">No lending box configured</span>
          )}
        </Td>
        <Td className="text-[12px] text-ink-secondary">{lender.contact_email ?? '—'}</Td>
        <Td numeric>{sent || '—'}</Td>
        <Td numeric>{submitted || '—'}</Td>
        <Td>
          <Badge
            tone={
              lender.verification_status === 'verified' ? 'positive'
              : lender.verification_status === 'rejected' ? 'critical'
              : lender.verification_status === 'suspended' ? 'warning'
              : 'neutral'
            }
          >
            {titleize(lender.verification_status)}
          </Badge>
          {lender.verified_at ? (
            <span className="mt-0.5 block text-[10px] text-ink-muted">{formatDate(lender.verified_at)}</span>
          ) : null}
        </Td>
        <Td>
          <VerificationControl lenderId={lender.id} current={lender.verification_status} name={lender.institution_name} />
        </Td>
      </Tr>
    )
  }

  const header = (
    <thead>
      <tr>
        <Th>Institution</Th><Th>Type</Th><Th>Published box</Th><Th>Contact</Th>
        <Th numeric>Deals sent</Th><Th numeric>Indications</Th><Th>Status</Th><Th className="w-56">Action</Th>
      </tr>
    </thead>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Lender verification"
        description="Only verified institutions receive borrower opportunities, browse the marketplace, or see any facility identity."
      />

      {pending.length > 0 ? (
        <Section title={`Awaiting verification (${pending.length})`}>
          <Table>{header}<tbody>{pending.map(renderRow)}</tbody></Table>
        </Section>
      ) : (
        <Card><CardBody><p className="text-[13px] text-ink-secondary">No institutions are awaiting verification.</p></CardBody></Card>
      )}

      <Section title={`All institutions (${others.length})`}>
        <Table>{header}<tbody>{others.map(renderRow)}</tbody></Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
