import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { CURRENT_NDA } from '@/lib/equity/nda'
import { recordAudit } from '../audit'
import { requireOffering } from './offerings'
import type { Actor } from '@/lib/auth/session'
import type { NdaAcceptance } from '@/types/equity'

/**
 * The confidentiality gate.
 *
 * Nothing beyond the marketplace teaser is shown to an outside viewer until
 * they have accepted the agreement for that specific offering. The gate is
 * enforced here rather than in the page, because a server action reached
 * directly would otherwise be a way around it — every entry point that returns
 * offering detail calls `requireNda` first.
 *
 * Two kinds of viewer are exempt, and only these two:
 *
 *   - the operator raising it and their colleagues, who cannot be asked to
 *     keep their own figures confidential from themselves; and
 *   - administrators, whose access is a supervisory function and is recorded
 *     in the audit log rather than gated by consent.
 */

/** Whether this actor needs to accept an NDA before seeing offering detail. */
export function ndaApplies(actor: Actor, offeringCompanyId: string): boolean {
  if (actor.isAdmin) return false
  return actor.company.id !== offeringCompanyId
}

/** The acceptance on file for this actor's organisation, if any. */
export async function ndaFor(actor: Actor, offeringId: string): Promise<NdaAcceptance | null> {
  const store = await db()
  const rows = await store.select('nda_acceptances', {
    where: { offering_id: offeringId, company_id: actor.company.id },
  })
  // Only an acceptance of the text now in force opens the gate. Changing the
  // agreement re-asks everyone, which is the point of versioning it.
  return rows.find((row) => row.nda_version === CURRENT_NDA.version) ?? null
}

export interface NdaState {
  /** False for the operator's own team and for administrators. */
  required: boolean
  accepted: boolean
  acceptance: NdaAcceptance | null
}

export async function ndaState(actor: Actor, offeringId: string): Promise<NdaState> {
  const offering = await requireOffering(offeringId)
  if (!ndaApplies(actor, offering.company_id)) {
    return { required: false, accepted: true, acceptance: null }
  }
  const acceptance = await ndaFor(actor, offeringId)
  return { required: true, accepted: acceptance !== null, acceptance }
}

/**
 * Throws unless this actor may see the offering's detail.
 *
 * Call from every service and action that returns more than the teaser.
 */
export async function requireNda(actor: Actor, offeringId: string): Promise<void> {
  const state = await ndaState(actor, offeringId)
  authorize(
    state.accepted,
    'Accept the confidentiality agreement on this offering before its details can be shown.',
  )
}

export async function acceptNda(
  actor: Actor,
  offeringId: string,
  signedName: string,
  request: { ip?: string | null; userAgent?: string | null } = {},
): Promise<NdaAcceptance> {
  const trimmed = signedName.trim()
  authorize(trimmed.length >= 2, 'Type your full name to sign the agreement.')

  const offering = await requireOffering(offeringId)
  authorize(
    ndaApplies(actor, offering.company_id),
    'You do not need a confidentiality agreement for your own organisation’s offering.',
  )

  const existing = await ndaFor(actor, offeringId)
  if (existing) return existing

  const store = await db()
  const acceptance = await store.insert('nda_acceptances', {
    offering_id: offeringId,
    company_id: actor.company.id,
    user_id: actor.user.id,
    investor_id: actor.investor?.id ?? null,
    nda_version: CURRENT_NDA.version,
    signed_name: trimmed,
    accepted_at: new Date().toISOString(),
    ip_address: request.ip ?? null,
    user_agent: request.userAgent ?? null,
  } as Omit<NdaAcceptance, 'id' | 'created_at'>)

  await recordAudit({
    actor,
    action: 'offering.nda_accepted',
    entityType: 'offering',
    entityId: offeringId,
    summary: `${actor.company.name} accepted the confidentiality agreement on ${offering.name}.`,
    metadata: { ndaVersion: CURRENT_NDA.version, signedName: trimmed },
  })

  return acceptance
}

/** Everyone who has signed for an offering. For the operator's own screen. */
export async function signatoriesFor(actor: Actor, offeringId: string): Promise<NdaAcceptance[]> {
  const offering = await requireOffering(offeringId)
  authorize(
    actor.isAdmin || actor.company.id === offering.company_id,
    'Only the operator raising this offering can see who has signed.',
  )
  const store = await db()
  return store.select('nda_acceptances', {
    where: { offering_id: offeringId },
    orderBy: { field: 'accepted_at', dir: 'desc' },
  })
}
