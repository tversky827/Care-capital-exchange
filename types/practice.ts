import type { ISODate, UUID } from '@/types'
import type { SandboxEnvironment } from '@/lib/environment'

/**
 * The sandbox's own data.
 *
 * Deliberately its own set of tables rather than an `environment` column on
 * the production ones. A column would mean every query that moves money is one
 * forgotten `where` clause away from moving real money; separate tables mean
 * the production ledger has no row a sandbox write could ever land on, and the
 * sandbox services do not import the production ones at all.
 *
 * What these tables never contain is a reference to anything in the production
 * money path — no order id, no cash ledger entry id, no investor account id.
 * They point at offerings, and only to read them.
 *
 * Money is in integer minor units throughout, as everywhere else. Virtual
 * money that rounds differently from real money would teach the wrong thing.
 */

export type PracticeAccountStatus = 'active' | 'closed'

export interface PracticeAccount {
  id: UUID
  user_id: UUID
  company_id: UUID
  /** Which sandbox this account belongs to. An account never spans two. */
  environment: SandboxEnvironment
  /** Shown to the holder, so they can name the thing they are looking at. */
  reference: string
  status: PracticeAccountStatus
  opened_at: ISODate
  /** How many times the holder has started over. Kept, not reset. */
  reset_count: number
  last_reset_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export const PRACTICE_ENTRY_TYPES = [
  'opening_balance',
  'deposit',
  'withdrawal',
  'investment_debit',
  'investment_refund',
  'distribution_credit',
  'exit_proceeds',
  'adjustment',
] as const

export type PracticeEntryType = (typeof PRACTICE_ENTRY_TYPES)[number]

/**
 * One movement of virtual cash.
 *
 * Append-only and signed, exactly like the production ledger: a balance is the
 * sum of these and is never stored. Unlike the production ledger there is no
 * pending state — virtual money has no bank behind it to clear through, and
 * inventing a settlement delay would be theatre rather than instruction.
 */
export interface PracticeLedgerEntry {
  id: UUID
  account_id: UUID
  environment: SandboxEnvironment
  type: PracticeEntryType
  /** Signed. Negative takes money out. Never zero. */
  amount_cents: number
  description: string
  /** Scoped to the account. A repeated key is the same entry, not a new one. */
  idempotency_key: string
  reference_type: 'offering' | 'position' | 'reset' | null
  reference_id: UUID | null
  effective_at: ISODate
  created_at: ISODate
}

export type PracticePositionStatus = 'active' | 'exited'

export interface PracticePosition {
  id: UUID
  account_id: UUID
  environment: SandboxEnvironment
  /** The offering this hypothetical stake is in. Read-only, always. */
  offering_id: UUID
  deal_id: UUID
  invested_cents: number
  distributions_cents: number
  exit_proceeds_cents: number
  status: PracticePositionStatus
  acquired_at: ISODate
  exited_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export const PRACTICE_ACTIVITY_KINDS = [
  'account_opened',
  'cash_added',
  'cash_withdrawn',
  'invested',
  'distribution',
  'exited',
  'watchlist_added',
  'watchlist_removed',
  'scenario_run',
  'reset',
] as const

export type PracticeActivityKind = (typeof PRACTICE_ACTIVITY_KINDS)[number]

export interface PracticeActivity {
  id: UUID
  account_id: UUID
  environment: SandboxEnvironment
  kind: PracticeActivityKind
  summary: string
  offering_id: UUID | null
  amount_cents: number | null
  created_at: ISODate
}

export interface PracticeWatchlistEntry {
  id: UUID
  account_id: UUID
  offering_id: UUID
  note: string | null
  created_at: ISODate
}

/** A saved "what if": the assumptions changed, and what came out. */
export interface PracticeScenario {
  id: UUID
  account_id: UUID
  offering_id: UUID
  label: string
  inputs: Record<string, number | null>
  results: Record<string, number | null>
  created_at: ISODate
}

/** Evidence that a portfolio was cleared, kept so the history is complete. */
export interface PracticeReset {
  id: UUID
  account_id: UUID
  cash_before_cents: number
  invested_before_cents: number
  positions_cleared: number
  created_at: ISODate
}

/** What the sandbox opens with, in cents. */
export const OPENING_BALANCE_CENTS: Record<SandboxEnvironment, number> = {
  practice: 100_000_00,
  demo: 250_000_00,
}

/** The amounts offered on the "add virtual cash" control, in cents. */
export const VIRTUAL_CASH_PRESETS_CENTS = [
  10_000_00, 25_000_00, 50_000_00, 100_000_00, 250_000_00, 500_000_00, 1_000_000_00,
] as const

/** The most virtual cash one sandbox account may hold, in cents. */
export const MAX_VIRTUAL_BALANCE_CENTS = 25_000_000_00
