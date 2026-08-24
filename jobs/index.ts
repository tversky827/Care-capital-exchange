import 'server-only'
import { registerJobHandler } from '@/services/jobs'
import { processDocument } from '@/services/extraction'
import { runReconciliation } from '@/services/discrepancies'
import { runUnderwriting } from '@/services/underwriting'
import { computeMatches } from '@/services/matching'
import { runLenderAlerts } from '@/services/lenders'
import { fulfilDataRequests } from '@/services/messages'
import { db } from '@/db'

/**
 * Job handler registry.
 *
 * Importing this module registers every handler. `services/jobs` imports it
 * lazily at execution time, which keeps the dependency one-directional:
 * services enqueue, this module wires the handlers to them.
 *
 * `document.process` is the pipeline's spine — it chains reconciliation and
 * match recomputation so a single upload updates everything downstream without
 * the caller orchestrating it.
 */

registerJobHandler('document.process', async (payload) => {
  const documentId = String(payload.documentId)
  const result = await processDocument(documentId)

  const store = await db()
  const document = await store.findById('documents', documentId)
  if (!document) return

  if (result.status === 'processed') {
    await fulfilDataRequests(document.deal_id, documentId, document.doc_type)
  }

  // New data can create, resolve or change a discrepancy, and can move any
  // metric a lender is matched on.
  await runReconciliation(document.deal_id)
  await computeMatches(document.deal_id, { explain: false })
})

registerJobHandler('deal.reconcile', async (payload) => {
  await runReconciliation(String(payload.dealId))
})

registerJobHandler('deal.underwrite', async (payload) => {
  const dealId = String(payload.dealId)
  await runUnderwriting(dealId, { force: Boolean(payload.force) })
  await computeMatches(dealId)
})

registerJobHandler('deal.match', async (payload) => {
  await computeMatches(String(payload.dealId), { explain: payload.explain !== false })
})

registerJobHandler('deal.alerts', async (payload) => {
  await runLenderAlerts(String(payload.dealId))
})
