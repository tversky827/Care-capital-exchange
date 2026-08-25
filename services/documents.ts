import 'server-only'
import { db } from '@/db'
import { documentContext, subjectOf } from '@/lib/access'
import { authorize, canDeleteDocument, canDownloadDocument, canUploadDocument, canViewDocument } from '@/lib/policy'
import { DOCUMENT_TOKEN_TTL_SECONDS, signToken, verifyToken } from '@/lib/auth/tokens'
import { getStorage, storageKeyFor } from './storage'
import { recordAudit } from './audit'
import { enqueue } from './jobs'
import { notify } from './notifications'
import type { Actor } from '@/lib/auth/session'
import type { DocumentCategory, DocumentRecord, DocumentType } from '@/types'

/**
 * The secure data room.
 *
 * Two invariants hold everywhere in this module:
 *  1. Nothing is ever served from a public URL. Reads go through
 *     `authorizeDownload`, which checks policy and writes an access log entry
 *     before a single byte is returned.
 *  2. Deletes are soft. A document a lender has already seen is never erased
 *     from the record, only withdrawn from view.
 */

/**
 * Largest file the product will accept, in bytes.
 *
 * Configurable because the ceiling is usually the host's, not ours: Vercel's
 * serverless functions reject a request body over 4.5MB before any of this
 * code runs. Setting MAX_UPLOAD_MB to match the platform turns an opaque
 * upload failure into a clear message about a file that is too large.
 */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024

const CATEGORY_FOR_TYPE: Record<DocumentType, DocumentCategory> = {
  articles: 'corporate', operating_agreement: 'corporate', entity_chart: 'corporate',
  ownership_document: 'corporate',
  profit_and_loss: 'financial', balance_sheet: 'financial', cash_flow: 'financial',
  tax_return: 'financial', ar_aging: 'financial', ap_aging: 'financial', bank_statement: 'financial',
  census: 'facility', payer_mix: 'facility', cms_information: 'facility', license: 'facility',
  survey: 'facility',
  loi: 'transaction', purchase_agreement: 'transaction', appraisal: 'transaction',
  environmental: 'transaction', existing_debt: 'transaction',
  resume: 'sponsor', personal_financial_statement: 'sponsor', reference: 'sponsor',
  other: 'other',
}

export function categoryForType(type: DocumentType): DocumentCategory {
  return CATEGORY_FOR_TYPE[type] ?? 'other'
}

export interface UploadInput {
  actor: Actor
  dealId: string
  filename: string
  mimeType: string
  data: Buffer
  docType: DocumentType
  displayName?: string
  visibility?: DocumentRecord['visibility']
  /** Replaces an existing document, creating a new version of it. */
  replacesDocumentId?: string | null
  /**
   * How extraction is scheduled. `background` (the default) returns as soon as
   * the file is stored; `inline` waits for the pipeline; `none` leaves the
   * document queued for a caller that will process it itself.
   */
  processing?: 'background' | 'inline' | 'none'
}

export async function uploadDocument(input: UploadInput): Promise<DocumentRecord> {
  const store = await db()
  const deal = await store.findById('deals', input.dealId)
  if (!deal) throw new Error('Deal not found.')
  authorize(canUploadDocument(subjectOf(input.actor), deal), 'You cannot upload documents to this deal.')

  if (input.data.length === 0) throw new Error('The uploaded file is empty.')
  if (input.data.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Files must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller.`)
  }

  const key = storageKeyFor(input.dealId, input.filename)
  const stored = await getStorage().put(key, input.data, input.mimeType)

  let record: DocumentRecord
  if (input.replacesDocumentId) {
    const previous = await store.findById('documents', input.replacesDocumentId)
    if (!previous || previous.deal_id !== input.dealId) throw new Error('Document to replace was not found.')
    // Preserve the superseded bytes as a version before pointing at the new file.
    await store.insert('document_versions', {
      document_id: previous.id,
      version: previous.version,
      storage_key: previous.storage_key,
      size_bytes: previous.size_bytes,
      checksum: previous.checksum,
      uploaded_by: previous.uploaded_by,
    } as never)
    record = await store.update('documents', previous.id, {
      filename: input.filename,
      display_name: input.displayName ?? input.filename,
      mime_type: input.mimeType,
      size_bytes: stored.size,
      storage_key: stored.key,
      checksum: stored.checksum,
      uploaded_by: input.actor.user.id,
      version: previous.version + 1,
      processing_status: 'queued',
      extraction_status: 'pending',
      malware_scan: 'pending',
      notes: null,
    })
  } else {
    record = await store.insert('documents', {
      deal_id: input.dealId,
      company_id: input.actor.company.id,
      category: categoryForType(input.docType),
      doc_type: input.docType,
      filename: input.filename,
      display_name: input.displayName ?? input.filename,
      mime_type: input.mimeType,
      size_bytes: stored.size,
      storage_key: stored.key,
      checksum: stored.checksum,
      uploaded_by: input.actor.user.id,
      version: 1,
      current_version_id: null,
      processing_status: 'queued',
      extraction_status: 'pending',
      page_count: null,
      malware_scan: 'pending',
      visibility: input.visibility ?? 'distributed_lenders',
      notes: null,
      is_demo: false,
      deleted_at: null,
    } as Omit<DocumentRecord, 'id' | 'created_at' | 'updated_at'>)
  }

  await recordAudit({
    actor: input.actor,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: record.id,
    dealId: input.dealId,
    summary: `${input.actor.user.full_name} uploaded ${record.display_name}.`,
    metadata: { docType: input.docType, sizeBytes: stored.size, checksum: stored.checksum, version: record.version },
  })

  // Processing runs as a job so a large or slow document never blocks the
  // upload response, and so a failure is retryable.
  const processing = input.processing ?? 'background'
  if (processing !== 'none') {
    await enqueue({
      kind: 'document.process',
      payload: { documentId: record.id },
      dealId: input.dealId,
      runInline: processing === 'inline',
    })
  }

  return record
}

export interface DownloadGrant {
  document: DocumentRecord
  bytes: Buffer
  /** Set when the storage driver can serve the file directly. */
  redirectUrl: string | null
}

/**
 * Authorizes and logs a document read, then returns the bytes.
 *
 * The access log entry is written for denials too — an attempt to reach a
 * document a lender is not entitled to is exactly the event an administrator
 * needs to see.
 */
export async function authorizeDownload(
  actor: Actor,
  documentId: string,
  action: 'view' | 'download' | 'preview',
  request: { ip?: string | null; userAgent?: string | null } = {},
): Promise<DownloadGrant> {
  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error('Document not found.')
  const deal = await store.findById('deals', document.deal_id)
  if (!deal) throw new Error('Deal not found.')

  const subject = subjectOf(actor)
  const context = await documentContext(actor, document)
  const permitted =
    action === 'download'
      ? canDownloadDocument(subject, document, deal, context)
      : canViewDocument(subject, document, deal, context)

  await store.insert('document_access_logs', {
    document_id: documentId,
    deal_id: document.deal_id,
    user_id: actor.user.id,
    company_id: actor.company.id,
    action: permitted ? action : 'denied',
    ip: request.ip ?? null,
    user_agent: request.userAgent ?? null,
  } as never)

  if (!permitted) {
    await recordAudit({
      actor,
      action: 'document.access_denied',
      entityType: 'document',
      entityId: documentId,
      dealId: document.deal_id,
      summary: `Access to ${document.display_name} was denied.`,
      metadata: { attemptedAction: action },
      ip: request.ip ?? null,
    })
    throw new Error('You do not have access to this document.')
  }

  if (document.malware_scan === 'infected') {
    throw new Error('This document was quarantined by the malware scanner and cannot be opened.')
  }

  const storage = getStorage()
  const redirectUrl = await storage.signedUrl(document.storage_key, DOCUMENT_TOKEN_TTL_SECONDS)

  await recordAudit({
    actor,
    action: `document.${action}`,
    entityType: 'document',
    entityId: documentId,
    dealId: document.deal_id,
    summary: `${actor.user.full_name} ${action === 'download' ? 'downloaded' : 'viewed'} ${document.display_name}.`,
    metadata: { docType: document.doc_type },
    ip: request.ip ?? null,
  })

  return {
    document,
    bytes: redirectUrl ? Buffer.alloc(0) : await storage.get(document.storage_key),
    redirectUrl,
  }
}

/** Short-lived, signed handle for an inline preview. */
export function issueDocumentToken(documentId: string, userId: string): string {
  return signToken({ documentId, userId, scope: 'document' }, DOCUMENT_TOKEN_TTL_SECONDS)
}

export function readDocumentToken(token: string): { documentId: string; userId: string } | null {
  const payload = verifyToken<{ documentId: string; userId: string; scope: string }>(token)
  if (!payload || payload.scope !== 'document') return null
  return { documentId: payload.documentId, userId: payload.userId }
}

export async function softDeleteDocument(actor: Actor, documentId: string): Promise<void> {
  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error('Document not found.')
  authorize(canDeleteDocument(subjectOf(actor), document), 'You cannot delete this document.')

  await store.update('documents', documentId, { deleted_at: new Date().toISOString() })
  await recordAudit({
    actor,
    action: 'document.deleted',
    entityType: 'document',
    entityId: documentId,
    dealId: document.deal_id,
    summary: `${actor.user.full_name} removed ${document.display_name} from the data room.`,
    metadata: { docType: document.doc_type },
  })
}

export async function updateDocument(
  actor: Actor,
  documentId: string,
  patch: Pick<Partial<DocumentRecord>, 'display_name' | 'doc_type' | 'visibility'>,
): Promise<DocumentRecord> {
  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error('Document not found.')
  authorize(canDeleteDocument(subjectOf(actor), document), 'You cannot modify this document.')

  const next: Partial<DocumentRecord> = { ...patch }
  if (patch.doc_type) next.category = categoryForType(patch.doc_type)
  const updated = await store.update('documents', documentId, next)

  await recordAudit({
    actor,
    action: 'document.updated',
    entityType: 'document',
    entityId: documentId,
    dealId: document.deal_id,
    summary: `${actor.user.full_name} updated ${updated.display_name}.`,
    metadata: { fields: Object.keys(patch) },
  })

  // Recategorising changes what the pipeline expects to find in the file.
  if (patch.doc_type && patch.doc_type !== document.doc_type) {
    await enqueue({ kind: 'document.process', payload: { documentId }, dealId: document.deal_id })
  }
  return updated
}

export async function documentsForDeal(dealId: string, includeDeleted = false): Promise<DocumentRecord[]> {
  const store = await db()
  const rows = await store.select('documents', {
    where: { deal_id: dealId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
  return includeDeleted ? rows : rows.filter((d) => !d.deleted_at)
}

/** Documents a specific lender is entitled to see on a distributed deal. */
export async function documentsVisibleToLender(dealId: string, actor: Actor): Promise<DocumentRecord[]> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) return []
  const subject = subjectOf(actor)
  const documents = await documentsForDeal(dealId)
  const visible: DocumentRecord[] = []
  for (const document of documents) {
    const context = await documentContext(actor, document)
    if (canViewDocument(subject, document, deal, context)) visible.push(document)
  }
  return visible
}

export async function accessLogFor(documentId: string) {
  const store = await db()
  return store.select('document_access_logs', {
    where: { document_id: documentId },
    orderBy: { field: 'created_at', dir: 'desc' },
    limit: 100,
  })
}

export async function grantDocumentAccess(
  actor: Actor,
  documentId: string,
  companyId: string,
  options: { canDownload?: boolean; expiresAt?: string | null } = {},
): Promise<void> {
  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error('Document not found.')
  authorize(canDeleteDocument(subjectOf(actor), document), 'You cannot share this document.')

  const existing = await store.selectOne('document_permissions', {
    where: { document_id: documentId, company_id: companyId },
  })
  const payload = {
    can_view: true,
    can_download: options.canDownload ?? true,
    expires_at: options.expiresAt ?? null,
  }
  if (existing) {
    await store.update('document_permissions', existing.id, payload)
  } else {
    await store.insert('document_permissions', {
      document_id: documentId,
      company_id: companyId,
      granted_by: actor.user.id,
      ...payload,
    } as never)
  }

  await recordAudit({
    actor,
    action: 'document.shared',
    entityType: 'document',
    entityId: documentId,
    dealId: document.deal_id,
    summary: `${actor.user.full_name} granted access to ${document.display_name}.`,
    metadata: { companyId, ...payload },
  })

  await notify({
    event: 'document.uploaded',
    companyId,
    dealId: document.deal_id,
    title: `A document was shared with you`,
    body: `${document.display_name} is now available in the deal room.`,
    href: `/lender/deals/${document.deal_id}/documents`,
  })
}
