import { describe, expect, it } from 'vitest'
import {
  canDistributeDeal, canDownloadDocument, canEditDeal, canSelectIndication, canSubmitIndication,
  canViewDeal, canViewDealIdentity, canViewDocument, canViewIndication, canViewLenderNote,
  canViewThread, isMarketplaceVisible, type PolicySubject,
} from '@/lib/policy'
import type { Deal, DealDistribution, DocumentRecord, Indication, LenderNote, MessageThread } from '@/types'

const BORROWER_CO = 'co-borrower'
const OTHER_BORROWER_CO = 'co-borrower-2'
const LENDER_CO = 'co-lender'
const RIVAL_LENDER_CO = 'co-lender-rival'
const LENDER_ID = 'lender-1'
const RIVAL_LENDER_ID = 'lender-2'

const borrower: PolicySubject = {
  userId: 'u1', companyId: BORROWER_CO, companyType: 'borrower', memberRole: 'owner',
  lenderId: null, investorId: null, isAdmin: false,
}
const borrowerViewer: PolicySubject = { ...borrower, userId: 'u1v', memberRole: 'viewer' }
const otherBorrower: PolicySubject = { ...borrower, userId: 'u2', companyId: OTHER_BORROWER_CO }
const lender: PolicySubject = {
  userId: 'u3', companyId: LENDER_CO, companyType: 'lender', memberRole: 'member',
  lenderId: LENDER_ID, investorId: null, isAdmin: false,
}
const rivalLender: PolicySubject = {
  userId: 'u4', companyId: RIVAL_LENDER_CO, companyType: 'lender', memberRole: 'member',
  lenderId: RIVAL_LENDER_ID, investorId: null, isAdmin: false,
}
const admin: PolicySubject = {
  userId: 'u5', companyId: 'co-admin', companyType: 'admin', memberRole: 'owner',
  lenderId: null, investorId: null, isAdmin: true,
}

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1', reference: 'CCX-1001', company_id: BORROWER_CO, created_by: 'u1',
    name: 'Lakeview Skilled Nursing Center', asset_type: 'snf', transaction_type: 'acquisition',
    status: 'distributed', distribution_scope: 'selected_lenders', anonymize_in_marketplace: true,
    borrower_priority: 'lowest_rate', target_close_date: null, narrative: null, is_demo: true,
    distributed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

function makeDistribution(overrides: Partial<DealDistribution> = {}): DealDistribution {
  return {
    id: 'dist-1', deal_id: 'deal-1', lender_id: LENDER_ID, match_id: null, distributed_by: 'u1',
    scope: 'selected_lenders', status: 'sent', pipeline_stage: 'new_match', first_viewed_at: null,
    last_viewed_at: null, view_count: 0, passed_reason: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1', deal_id: 'deal-1', company_id: BORROWER_CO, category: 'financial',
    doc_type: 'profit_and_loss', filename: 'pl-2025.pdf', display_name: '2025 P&L',
    mime_type: 'application/pdf', size_bytes: 1024, storage_key: 'k', checksum: 'c',
    uploaded_by: 'u1', version: 1, current_version_id: null, processing_status: 'processed',
    extraction_status: 'complete', page_count: 4, malware_scan: 'clean',
    visibility: 'distributed_lenders', notes: null, is_demo: true, deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

describe('deal visibility', () => {
  it('grants the owning borrower access', () => {
    expect(canViewDeal(borrower, makeDeal())).toBe(true)
  })

  it('denies an unrelated borrower', () => {
    expect(canViewDeal(otherBorrower, makeDeal())).toBe(false)
  })

  it('denies a lender with no distribution', () => {
    expect(canViewDeal(lender, makeDeal())).toBe(false)
  })

  it('grants a lender that the deal was distributed to', () => {
    expect(canViewDeal(lender, makeDeal(), { distribution: makeDistribution() })).toBe(true)
  })

  it("denies a lender holding another lender's distribution row", () => {
    const foreign = makeDistribution({ lender_id: RIVAL_LENDER_ID })
    expect(canViewDeal(lender, makeDeal(), { distribution: foreign })).toBe(false)
  })

  it('denies a lender whose distribution was revoked', () => {
    const revoked = makeDistribution({ status: 'revoked' })
    expect(canViewDeal(lender, makeDeal(), { distribution: revoked })).toBe(false)
  })

  it('exposes marketplace deals to any lender but not to other borrowers', () => {
    const deal = makeDeal({ distribution_scope: 'marketplace' })
    expect(isMarketplaceVisible(deal)).toBe(true)
    expect(canViewDeal(rivalLender, deal)).toBe(true)
    expect(canViewDeal(otherBorrower, deal)).toBe(false)
  })

  it('does not treat an undistributed marketplace draft as visible', () => {
    const deal = makeDeal({ distribution_scope: 'marketplace', status: 'draft', distributed_at: null })
    expect(isMarketplaceVisible(deal)).toBe(false)
    expect(canViewDeal(rivalLender, deal)).toBe(false)
  })

  it('grants admins access to everything', () => {
    expect(canViewDeal(admin, makeDeal())).toBe(true)
  })
})

describe('deal identity (confidentiality)', () => {
  it('withholds facility identity from marketplace browsers when anonymized', () => {
    const deal = makeDeal({ distribution_scope: 'marketplace', anonymize_in_marketplace: true })
    expect(canViewDeal(rivalLender, deal)).toBe(true)
    expect(canViewDealIdentity(rivalLender, deal)).toBe(false)
  })

  it('reveals identity to a lender the deal was distributed to', () => {
    const deal = makeDeal({ distribution_scope: 'marketplace' })
    expect(canViewDealIdentity(lender, deal, { distribution: makeDistribution() })).toBe(true)
  })

  it('reveals identity when the borrower opted out of anonymization', () => {
    const deal = makeDeal({ distribution_scope: 'marketplace', anonymize_in_marketplace: false })
    expect(canViewDealIdentity(rivalLender, deal)).toBe(true)
  })
})

describe('deal mutation', () => {
  it('blocks viewers from editing', () => {
    expect(canEditDeal(borrowerViewer, makeDeal())).toBe(false)
  })

  it('blocks lenders from editing a borrower deal', () => {
    expect(canEditDeal(lender, makeDeal(), )).toBe(false)
  })

  it('freezes terminal deals for the borrower but not the admin', () => {
    const funded = makeDeal({ status: 'funded' })
    expect(canEditDeal(borrower, funded)).toBe(false)
    expect(canEditDeal(admin, funded)).toBe(true)
  })

  it('restricts distribution to owners and company admins', () => {
    expect(canDistributeDeal(borrower, makeDeal())).toBe(true)
    expect(canDistributeDeal({ ...borrower, memberRole: 'member' }, makeDeal())).toBe(false)
  })
})

describe('document access', () => {
  const deal = makeDeal()

  it('lets the owning company see its own documents', () => {
    expect(canViewDocument(borrower, makeDocument(), deal)).toBe(true)
  })

  it('denies a lender without a distribution', () => {
    expect(canViewDocument(lender, makeDocument(), deal)).toBe(false)
  })

  it('grants a distributed lender access to lender-visible documents', () => {
    expect(canViewDocument(lender, makeDocument(), deal, { distribution: makeDistribution() })).toBe(true)
  })

  it('never exposes restricted documents to a lender, even when distributed', () => {
    const restricted = makeDocument({ visibility: 'restricted' })
    expect(canViewDocument(lender, restricted, deal, { distribution: makeDistribution() })).toBe(false)
  })

  it('keeps deal-team-only documents inside the borrower organisation', () => {
    const internal = makeDocument({ visibility: 'deal_team' })
    expect(canViewDocument(lender, internal, deal, { distribution: makeDistribution() })).toBe(false)
    expect(canViewDocument(borrower, internal, deal)).toBe(true)
  })

  it('does not let marketplace discovery alone reach a document', () => {
    const marketplaceDeal = makeDeal({ distribution_scope: 'marketplace' })
    expect(canViewDeal(rivalLender, marketplaceDeal)).toBe(true)
    expect(canViewDocument(rivalLender, makeDocument(), marketplaceDeal)).toBe(false)
  })

  it('honours an explicit grant for a deal-team document', () => {
    const internal = makeDocument({ visibility: 'deal_team' })
    const grant = { can_view: true, can_download: false, expires_at: null }
    expect(canViewDocument(lender, internal, deal, { grant })).toBe(true)
    expect(canDownloadDocument(lender, internal, deal, { grant })).toBe(false)
  })

  it('rejects an expired grant', () => {
    const internal = makeDocument({ visibility: 'deal_team' })
    const grant = { can_view: true, can_download: true, expires_at: '2020-01-01T00:00:00.000Z' }
    expect(canViewDocument(lender, internal, deal, { grant })).toBe(false)
  })

  it('hides soft-deleted documents from everyone but admins', () => {
    const deleted = makeDocument({ deleted_at: '2026-02-01T00:00:00.000Z' })
    expect(canViewDocument(borrower, deleted, deal)).toBe(false)
    expect(canViewDocument(admin, deleted, deal)).toBe(true)
  })
})

describe('lender privacy', () => {
  const note: LenderNote = {
    id: 'note-1', deal_id: 'deal-1', lender_id: LENDER_ID, author_id: 'u3',
    body: 'Credit committee is lukewarm on the Medicaid mix.',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }

  it('keeps internal notes inside the authoring lender', () => {
    expect(canViewLenderNote(lender, note)).toBe(true)
    expect(canViewLenderNote(rivalLender, note)).toBe(false)
    expect(canViewLenderNote(borrower, note)).toBe(false)
  })

  it('excludes even platform admins from private lender notes', () => {
    expect(canViewLenderNote(admin, note)).toBe(false)
  })
})

describe('indications', () => {
  const deal = makeDeal()
  const indication: Indication = {
    id: 'ind-1', deal_id: 'deal-1', lender_id: LENDER_ID, submitted_by: 'u3', version: 1,
    status: 'submitted', loan_amount: 10_500_000, rate_type: 'fixed', index_name: null,
    index_rate_pct: null, spread_pct: null, all_in_rate_pct: 7.25, term_months: 60,
    amortization_months: 300, interest_only_months: 12, origination_fee_pct: 1, exit_fee_pct: 0,
    prepayment_terms: null, recourse: 'partial_recourse', guarantees: null, covenants: null,
    closing_timeline_days: 60, expires_at: null, additional_terms: null, is_commitment: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }

  it('requires a live distribution to submit', () => {
    expect(canSubmitIndication(lender, deal)).toBe(false)
    expect(canSubmitIndication(lender, deal, { distribution: makeDistribution() })).toBe(true)
  })

  it('refuses submission on a closed deal', () => {
    const funded = makeDeal({ status: 'funded' })
    expect(canSubmitIndication(lender, funded, { distribution: makeDistribution() })).toBe(false)
  })

  it('never shows one lender a competitor indication', () => {
    expect(canViewIndication(lender, indication, deal)).toBe(true)
    expect(canViewIndication(rivalLender, indication, deal)).toBe(false)
    expect(canViewIndication(borrower, indication, deal)).toBe(true)
  })

  it('lets only the borrower select a preferred indication', () => {
    expect(canSelectIndication(borrower, deal)).toBe(true)
    expect(canSelectIndication(lender, deal)).toBe(false)
    expect(canSelectIndication(borrowerViewer, deal)).toBe(false)
  })
})

describe('message threads', () => {
  const deal = makeDeal()
  const thread: MessageThread = {
    id: 'thread-1', deal_id: 'deal-1', subject: '2025 agency labor detail',
    kind: 'lender_question', participant_company_ids: [BORROWER_CO, LENDER_CO],
    lender_id: LENDER_ID, created_by: 'u3', status: 'open',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }

  it('restricts a lender question to its participants', () => {
    expect(canViewThread(borrower, thread, deal)).toBe(true)
    expect(canViewThread(lender, thread, deal)).toBe(true)
    expect(canViewThread(rivalLender, thread, deal)).toBe(false)
  })
})
