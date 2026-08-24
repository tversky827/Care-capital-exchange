import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, Eye, FileText, ShieldAlert } from 'lucide-react'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { documentsForDeal } from '@/services/documents'
import { dataRequestsForDeal } from '@/services/messages'
import { readinessFor } from '@/services/underwriting'
import {
  Alert, Badge, Card, CardBody, EmptyState, Section, Table, Td, Th, Tr, type Tone,
} from '@/components/ui/primitives'
import { NextAction } from '@/components/deal/common'
import { UploadPanel } from './upload-panel'
import { DocumentRow } from './document-row'
import { formatBytes, formatRelative, titleize } from '@/lib/utils/format'
import { DOCUMENT_CATEGORIES, type DocumentProcessingStatus } from '@/types'

const STATUS_TONE: Record<DocumentProcessingStatus, Tone> = {
  uploaded: 'neutral', scanning: 'progress', queued: 'neutral', parsing: 'progress',
  extracting: 'progress', processed: 'positive', needs_ocr: 'warning', failed: 'critical',
  quarantined: 'critical',
}

export default async function DocumentsPage({
  params, searchParams,
}: {
  params: Promise<{ dealId: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const { created } = await searchParams
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [documents, requests, readiness] = await Promise.all([
    documentsForDeal(dealId),
    dataRequestsForDeal(dealId),
    readinessFor(dealId),
  ])
  const canEdit = canEditDeal(subjectOf(actor), deal)
  const openRequests = requests.filter((request) => request.status === 'open')

  const byCategory = DOCUMENT_CATEGORIES.map((category) => ({
    category,
    documents: documents.filter((document) => document.category === category),
  })).filter((group) => group.documents.length > 0)

  const outstandingDocs = readiness?.outstanding.filter((item) => item.docType) ?? []

  return (
    <div className="space-y-4">
      {created ? (
        <Alert tone="positive" title="Deal created">
          Upload your operating statements next. The pipeline reads them, extracts the figures for
          your review, and reconciles them against everything else on the deal.
        </Alert>
      ) : null}

      {outstandingDocs.length > 0 ? (
        <NextAction
          tone={outstandingDocs.some((item) => item.importance === 'required') ? 'warning' : 'accent'}
          headline={`${outstandingDocs.length} document${outstandingDocs.length === 1 ? '' : 's'} still needed`}
          detail="Substantially every lender requires these before issuing an indication. Providing them now avoids a round trip that typically costs a week."
          items={outstandingDocs.slice(0, 5).map((item) => ({ label: item.label }))}
        />
      ) : (
        <NextAction
          tone="positive"
          headline="Every expected document is on file"
          detail="The data room has what lenders need to underwrite this opportunity."
        />
      )}

      {openRequests.length > 0 ? (
        <Section title={`${openRequests.length} open document request${openRequests.length === 1 ? '' : 's'}`} description="Requested by a lender reviewing this deal.">
          <Table>
            <thead><tr><Th>Item</Th><Th>Type</Th><Th>Requested</Th></tr></thead>
            <tbody>
              {openRequests.map((request) => (
                <Tr key={request.id}>
                  <Td className="text-ink">
                    {request.label}
                    {request.detail ? <span className="block text-[11px] text-ink-muted">{request.detail}</span> : null}
                  </Td>
                  <Td className="text-ink-secondary">{titleize(request.doc_type)}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">{formatRelative(request.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      {canEdit ? <UploadPanel dealId={dealId} /> : null}

      <Section
        title="Data room"
        description={`${documents.length} document${documents.length === 1 ? '' : 's'}. Nothing here is served from a public link — every view and download is authorized and logged.`}
      >
        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title="The data room is empty"
            description="Upload operating statements, census, payer mix and the transaction documents. PDF, Excel, CSV, Word and images are all read by the pipeline."
          />
        ) : (
          <div className="divide-y divide-line">
            {byCategory.map((group) => (
              <div key={group.category}>
                <div className="flex items-center justify-between bg-surface-sunken px-4 py-1.5">
                  <span className="eyebrow">{titleize(group.category)}</span>
                  <span className="tnum text-[11px] text-ink-muted">{group.documents.length}</span>
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Document</Th>
                      <Th>Type</Th>
                      <Th>Processing</Th>
                      <Th>Visibility</Th>
                      <Th numeric>Size</Th>
                      <Th numeric>Uploaded</Th>
                      <Th className="w-40">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.documents.map((document) => (
                      <Tr key={document.id}>
                        <Td className="max-w-72">
                          <span className="block truncate font-medium text-ink">{document.display_name}</span>
                          <span className="block truncate text-[11px] text-ink-muted">
                            {document.filename}
                            {document.version > 1 ? ` · v${document.version}` : ''}
                            {document.page_count ? ` · ${document.page_count} pages` : ''}
                          </span>
                          {document.notes ? (
                            <span className="mt-1 block text-[11px] leading-snug text-warning">{document.notes}</span>
                          ) : null}
                        </Td>
                        <Td className="text-ink-secondary">{titleize(document.doc_type)}</Td>
                        <Td>
                          <Badge tone={STATUS_TONE[document.processing_status]}>
                            {titleize(document.processing_status)}
                          </Badge>
                          {document.malware_scan === 'infected' ? (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-critical">
                              <ShieldAlert className="size-3" /> Quarantined
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          <Badge tone={document.visibility === 'restricted' ? 'critical' : document.visibility === 'deal_team' ? 'neutral' : 'accent'}>
                            {document.visibility === 'distributed_lenders' ? 'Lenders' : titleize(document.visibility)}
                          </Badge>
                        </Td>
                        <Td numeric className="whitespace-nowrap text-ink-muted">{formatBytes(document.size_bytes)}</Td>
                        <Td numeric className="whitespace-nowrap text-ink-muted">{formatRelative(document.created_at)}</Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/api/documents/${document.id}/download?disposition=inline`}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                            >
                              <Eye className="size-3.5" /> View
                            </Link>
                            <Link
                              href={`/api/documents/${document.id}/download`}
                              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                            >
                              <Download className="size-3.5" /> Download
                            </Link>
                          </div>
                          {canEdit ? <DocumentRow dealId={dealId} document={{
                            id: document.id,
                            display_name: document.display_name,
                            doc_type: document.doc_type,
                            visibility: document.visibility,
                          }} /> : null}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Card>
        <CardBody>
          <p className="eyebrow mb-2">Document security</p>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-secondary">
            <li>· No document is ever served from a public URL. Every read passes an authorization check first.</li>
            <li>· Every view, download and denied attempt is written to an immutable access log with the user, company, time and address.</li>
            <li>· Documents marked <strong>Deal team</strong> never leave your organisation. Documents marked <strong>Restricted</strong> are never released to a lender under any circumstance.</li>
            <li>· Uploads are scanned before processing; anything that fails is quarantined rather than parsed.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

export const dynamic = 'force-dynamic'
