import { titleize } from '@/lib/utils/format'
import type { AssetType, Deal, Facility } from '@/types'

const ASSET_NOUNS: Record<AssetType, string> = {
  snf: 'Skilled Nursing Facility',
  alf: 'Assisted Living Facility',
  memory_care: 'Memory Care Facility',
  behavioral_health: 'Behavioral Health Facility',
  medical_office: 'Medical Office Building',
  hospital: 'Hospital',
  home_health: 'Home Health Agency',
  hospice: 'Hospice Agency',
  physician_practice: 'Physician Practice',
  dental_practice: 'Dental Practice',
  other: 'Healthcare Facility',
}

export function assetNoun(assetType: AssetType): string {
  return ASSET_NOUNS[assetType] ?? 'Healthcare Facility'
}

/**
 * The name shown to a party who is not entitled to the facility's identity.
 *
 * "120-bed Skilled Nursing Facility — Illinois" carries everything a lender
 * needs to decide whether to look closer, and nothing that identifies the
 * operator before the borrower has chosen to reveal it.
 */
export function anonymizedLabel(deal: Deal, facility: Facility | null): string {
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const noun = assetNoun(deal.asset_type)
  const where = facility?.state ? ` — ${stateName(facility.state)}` : ''
  return `${beds ? `${beds}-bed ` : ''}${noun}${where}`
}

/** The name to display, respecting the deal's confidentiality setting. */
export function displayName(deal: Deal, facility: Facility | null, canSeeIdentity: boolean): string {
  if (canSeeIdentity || !deal.anonymize_in_marketplace) return facility?.name ?? deal.name
  return anonymizedLabel(deal, facility)
}

export function displayLocation(facility: Facility | null, canSeeIdentity: boolean): string {
  if (!facility) return '—'
  if (canSeeIdentity) return [facility.city, facility.state].filter(Boolean).join(', ')
  return facility.state ? stateName(facility.state) : '—'
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

export function stateName(code: string): string {
  return STATE_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}

export const US_STATES = Object.entries(STATE_NAMES).map(([code, name]) => ({ code, name }))

export function statusLabel(status: Deal['status']): string {
  return titleize(status)
}

export const STATUS_TONE: Record<Deal['status'], 'neutral' | 'progress' | 'attention' | 'positive' | 'closed'> = {
  draft: 'neutral',
  intake: 'progress',
  document_collection: 'progress',
  processing: 'progress',
  underwriting: 'progress',
  needs_attention: 'attention',
  ready_for_distribution: 'positive',
  distributed: 'positive',
  indications_received: 'positive',
  under_loi: 'positive',
  diligence: 'progress',
  closing: 'progress',
  funded: 'positive',
  withdrawn: 'closed',
  rejected: 'closed',
  archived: 'closed',
}
