import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { formatDate, titleize } from '@/lib/utils/format'
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { dataRoomFor } from '@/services/equity/data-room'
import type { DataRoomEntry } from '@/services/equity/data-room'
import type { Offering } from '@/types/equity'

export const dynamic = 'force-dynamic'

/**
 * Everything an investor can currently open, in one place.
 *
 * Gathered per offering through the same access ladder the offering page uses,
 * so this view can never show a document the detail page would withhold. Tax
 * documents are listed separately because their availability is a matter of
 * timing rather than access level.
 */
export default async function InvestorDocumentsPage() {
  const actor = await requireActor()
  if (!actor.investor) redirect('/investor/onboarding')

  const store = await db()

  // Documents follow engagement, so the offerings to check are the ones this
  // investor has actually engaged with.
  const [interests, positions, taxDocuments] = await Promise.all([
    store.select('investment_interests', { where: { investor_id: actor.investor.id } }),
    store.select('investment_positions', { where: { investor_id: actor.investor.id } }),
    isAvailable('TAX_DOCUMENTS_ENABLED')
      ? store.select('tax_documents', {
        where: { investor_id: actor.investor.id },
        orderBy: { field: 'tax_year', dir: 'desc' },
      })
      : Promise.resolve([]),
  ])

  const offeringIds = [...new Set([
    ...interests.map((i) => i.offering_id),
    ...positions.map((p) => p.offering_id),
  ])]

  const groups: { offering: Offering; entries: DataRoomEntry[] }[] = []
  for (const offeringId of offeringIds) {
    const offering = await store.findById('offerings', offeringId)
    if (!offering) continue
    const entries = await dataRoomFor(actor, offeringId)
    if (entries.length === 0) continue
    groups.push({ offering, entries })
  }

  const taxRows = await Promise.all(taxDocuments.map(async (document) => ({
    document,
    offering: await store.findById('offerings', document.offering_id),
  })))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Holdings"
        title="Documents"
        description="Material released to you across the offerings you have engaged with. What you can open depends on how far you have gone with each one."
      />

      {groups.length === 0 && taxRows.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Documents become available as you engage with an offering. Expressing interest and acknowledging its disclosures each release more."
          action={<Link href="/investments" className="text-[13px] font-medium text-accent hover:underline">Browse opportunities</Link>}
        />
      ) : null}

      {groups.map(({ offering, entries }) => (
        <Card key={offering.id}>
          <CardHeader>
            <CardTitle>{offering.name}</CardTitle>
            <Link href={`/investments/${offering.id}`} className="text-[12px] font-medium text-accent hover:underline">
              Open offering
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {entries.map(({ entry, document }) => (
              <a
                key={entry.id}
                href={`/api/documents/${document.id}/download`}
                className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 hover:border-line-strong"
              >
                <span className="min-w-0 truncate text-[13px] text-ink">{entry.display_name}</span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {titleize(entry.category)}
                </span>
              </a>
            ))}
          </CardBody>
        </Card>
      ))}

      {taxRows.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Tax documents</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <thead>
                <Tr><Th>Year</Th><Th>Form</Th><Th>Investment</Th><Th>Status</Th><Th>Available</Th></Tr>
              </thead>
              <tbody>
                {taxRows.map(({ document, offering }) => (
                  <Tr key={document.id}>
                    <Td>{document.tax_year}</Td>
                    <Td>{document.kind === 'k1' ? 'Schedule K-1' : document.kind === '1099' ? 'Form 1099' : 'Other'}</Td>
                    <Td>{offering?.name ?? '—'}</Td>
                    <Td>
                      <Badge tone={document.status === 'available' ? 'positive' : 'neutral'}>
                        {titleize(document.status)}
                      </Badge>
                    </Td>
                    <Td>{document.available_at ? formatDate(document.available_at) : 'Pending'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      {taxRows.length > 0 ? (
        <Alert tone="neutral">
          CareCapital Exchange does not provide tax advice. Tax documents are prepared by each
          issuer, and questions about them should go to your own adviser.
        </Alert>
      ) : null}
    </div>
  )
}
