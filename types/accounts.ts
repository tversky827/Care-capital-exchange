import type { ISODate, UUID } from './index'

/**
 * The investor's account, their cash, and the orders that move it.
 *
 * The shape here is a brokerage's, not a crowdfunding site's: an investor
 * holds a balance and deploys it, rather than arranging a separate transfer
 * for every opportunity. That difference is the whole product, and it is why
 * these tables exist rather than an `amount` column on a commitment.
 *
 * Amounts are stored as an integer number of cents under `*_cents` names. The
 * suffix is deliberate: it is the one thing a reader has to know about a money
 * column, and a name that carries it cannot be misread as dollars.
 */

export const ACCOUNT_TYPES = [
  'individual', 'llc', 'trust', 'family_office', 'institution', 'other',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_STATUSES = [
  /** Opened, not yet through onboarding. Can browse, cannot fund or invest. */
  'pending',
  /** Onboarding complete and checks clear. Can fund and invest. */
  'active',
  /** Something needs the investor's attention before they can go further. */
  'action_required',
  /** Frozen by an administrator. Can read; nothing moves. */
  'suspended',
  'closed',
] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

/** Where a required check has got to. Held per check, never as one flag. */
export const CHECK_STATUSES = ['not_started', 'pending', 'passed', 'failed', 'expired'] as const
export type CheckStatus = (typeof CHECK_STATUSES)[number]

/**
 * An investor's account on the platform.
 *
 * Distinct from `investor_profiles`, which describes who they are and what
 * they look for. This describes what they are permitted to do and holds the
 * state a regulated provider will eventually own: identity, KYC, AML,
 * accreditation and tax status. Each is stored separately because they are
 * separate answers from separate providers that expire at separate times, and
 * collapsing them into one "verified" boolean loses the only thing an investor
 * needs to know — which one is holding them up.
 */
export interface InvestorAccount {
  id: UUID
  company_id: UUID
  investor_id: UUID | null
  account_type: AccountType
  /** Legal name of the person or entity the account belongs to. */
  legal_name: string
  reference: string
  status: AccountStatus
  identity_status: CheckStatus
  kyc_status: CheckStatus
  aml_status: CheckStatus
  accreditation_status: CheckStatus
  tax_status: CheckStatus
  /** Set when every required check has passed. */
  activated_at: ISODate | null
  /** Why the account is in `action_required` or `suspended`, in plain words. */
  status_reason: string | null
  created_at: ISODate
  updated_at: ISODate
}

/**
 * The cash account attached to an investor account.
 *
 * Holds no balance. The balance is the sum of the ledger's entries, which is
 * the only figure that cannot drift from the transactions that produced it.
 */
export interface CashAccount {
  id: UUID
  account_id: UUID
  currency: 'USD'
  /** The provider holding the money in production; null in demo. */
  provider: string | null
  provider_account_ref: string | null
  status: 'open' | 'frozen' | 'closed'
  created_at: ISODate
  updated_at: ISODate
}

/**
 * What a ledger entry is for.
 *
 * Signs are not encoded in the type — a `deposit` is positive and a
 * `withdrawal` negative, but the entry's own `amount_cents` carries the sign
 * and is the authority. A reader summing a column must never have to know a
 * per-type rule to get the right answer.
 */
export const LEDGER_ENTRY_TYPES = [
  'deposit',
  'withdrawal',
  'investment_debit',
  'investment_refund',
  'distribution_credit',
  'fee',
  'adjustment',
  'transfer_in',
  'transfer_out',
] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

/**
 * Money that has been promised but is not yet spendable.
 *
 * A deposit that has not cleared, and an order that has been placed but not
 * settled, both affect what an investor may do next without yet being part of
 * the settled balance. Holding that as a status on the entry keeps one row per
 * event: the entry is written once when the thing happens and moves through
 * its states, rather than being written, deleted and rewritten.
 */
export const LEDGER_ENTRY_STATUSES = ['pending', 'posted', 'failed', 'cancelled', 'reversed'] as const
export type LedgerEntryStatus = (typeof LEDGER_ENTRY_STATUSES)[number]

/**
 * One immutable movement of cash.
 *
 * Append-only. A mistake is corrected by posting a reversing entry that points
 * at the original through `reverses_entry_id`, never by editing the original —
 * an entry that can be edited is not evidence of anything, and a balance
 * derived from editable history cannot be reconciled against a provider.
 *
 * The single exception is `status`, which moves forward along a fixed path
 * (pending → posted, or pending → failed/cancelled). That is not a rewrite of
 * what happened; it is what happened, arriving in two parts.
 */
export interface CashLedgerEntry {
  id: UUID
  cash_account_id: UUID
  account_id: UUID
  type: LedgerEntryType
  /** Signed, in cents. Positive credits the investor, negative debits them. */
  amount_cents: number
  currency: 'USD'
  status: LedgerEntryStatus
  /** What this movement was about, for the investor to read. */
  description: string
  /** The offering, order, distribution or transfer this entry belongs to. */
  reference_type: 'order' | 'offering' | 'distribution' | 'transfer' | 'withdrawal' | 'fee' | null
  reference_id: UUID | null
  /**
   * Supplied by the caller and unique per account. Re-submitting the same key
   * returns the entry already written rather than writing a second one, which
   * is what stops a double-clicked button from spending twice.
   */
  idempotency_key: string
  /** Set on a reversing entry, pointing at what it reverses. */
  reverses_entry_id: UUID | null
  /** The provider movement this corresponds to, once there is one. */
  provider_transaction_id: UUID | null
  /** When the money actually moved, which is not always when it was recorded. */
  effective_at: ISODate
  posted_at: ISODate | null
  created_at: ISODate
}

/** A balance, derived. Never stored, so it can never be stale or edited. */
export interface CashBalance {
  /** Settled and spendable. */
  available_cents: number
  /** Deposits in flight: promised, not yet spendable. */
  pending_incoming_cents: number
  /** Committed to orders or withdrawals that have not settled. */
  pending_outgoing_cents: number
  /** available + pending incoming − pending outgoing. What is coming to rest. */
  projected_cents: number
}

export const FUNDING_METHODS = ['ach', 'wire', 'check', 'demo'] as const
export type FundingMethod = (typeof FUNDING_METHODS)[number]

/** A place money can come from or go to. Never holds full account numbers. */
export interface FundingSource {
  id: UUID
  account_id: UUID
  method: FundingMethod
  /** "Chase ••1234". A label, not an identifier. */
  display_name: string
  /** The last four digits, which is all that is ever shown or stored. */
  last4: string | null
  provider: string | null
  provider_source_ref: string | null
  status: 'pending' | 'verified' | 'failed' | 'removed'
  is_default: boolean
  created_at: ISODate
  updated_at: ISODate
}

export const TRANSFER_STATUSES = [
  'requested', 'pending', 'approved', 'processing', 'completed', 'failed', 'cancelled',
] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]

/** A deposit or withdrawal, and its progress through the provider. */
export interface CashTransfer {
  id: UUID
  account_id: UUID
  cash_account_id: UUID
  direction: 'deposit' | 'withdrawal'
  amount_cents: number
  currency: 'USD'
  method: FundingMethod
  funding_source_id: UUID | null
  status: TransferStatus
  /** The ledger entry this transfer wrote. */
  ledger_entry_id: UUID | null
  provider: string | null
  provider_transfer_ref: string | null
  failure_reason: string | null
  requested_at: ISODate
  completed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

/**
 * The states an investment order moves through.
 *
 * Written out rather than collapsed because each one is a real place an order
 * can be stuck, and an investor asking "where is my money" deserves an answer
 * more specific than "processing". No state is skipped: an order that settles
 * still passes through submitted and accepted, so the history reads as what
 * happened rather than as where it ended up.
 */
export const ORDER_STATUSES = [
  'draft',
  'eligibility_check',
  'pending_confirmation',
  'submitted',
  'accepted',
  'rejected',
  'settling',
  'settled',
  'cancelled',
  'failed',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Terminal states. An order here will not move again. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  'settled', 'rejected', 'cancelled', 'failed',
]

/**
 * An instruction to put a stated amount of the account's cash into an offering.
 *
 * The order is the durable record of intent; the position is what exists after
 * it settles. Keeping them apart is what allows an order to be rejected or to
 * fail without leaving a position that was never really taken.
 */
export interface InvestmentOrder {
  id: UUID
  reference: string
  account_id: UUID
  cash_account_id: UUID
  investor_id: UUID
  offering_id: UUID
  deal_id: UUID
  amount_cents: number
  currency: 'USD'
  status: OrderStatus
  /** The eligibility verdict at the moment it was placed, kept as evidence. */
  eligibility_verdict: string | null
  eligibility_detail: string | null
  /** Disclosures acknowledged for this order specifically. */
  acknowledged_disclosures: UUID[]
  /** The debit this order placed on the ledger. */
  ledger_entry_id: UUID | null
  /** The commitment and position it produced, once it settled. */
  commitment_id: UUID | null
  position_id: UUID | null
  /** Unique per account: the same key never places a second order. */
  idempotency_key: string
  provider: string | null
  provider_order_ref: string | null
  rejection_reason: string | null
  failure_reason: string | null
  submitted_at: ISODate | null
  accepted_at: ISODate | null
  settled_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

/**
 * A movement recorded against an external provider.
 *
 * Kept separately from the ledger so the platform's own record and the
 * provider's can be reconciled against each other rather than assumed equal.
 * In demo mode these are written by the mock providers, which is what makes
 * the reconciliation path exercisable before any real provider exists.
 */
export interface ProviderTransaction {
  id: UUID
  account_id: UUID
  provider: string
  provider_kind: 'cash' | 'payment' | 'custody' | 'broker_dealer' | 'transfer_agent'
  provider_ref: string
  kind: string
  amount_cents: number | null
  status: string
  /** Whether it has been matched against the platform's own record. */
  reconciled: boolean
  reconciled_at: ISODate | null
  payload: Record<string, unknown>
  created_at: ISODate
  updated_at: ISODate
}

/** An account held with an external provider, once one exists. */
export interface ProviderAccount {
  id: UUID
  account_id: UUID
  provider: string
  provider_kind: 'cash' | 'payment' | 'custody' | 'broker_dealer' | 'transfer_agent'
  provider_ref: string
  status: string
  created_at: ISODate
  updated_at: ISODate
}
