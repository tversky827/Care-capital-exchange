import 'server-only'
import { db } from '@/db'
import { authorize } from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { cents, format, type Cents } from '@/lib/money'
import { recordAudit } from '../audit'
import { post } from './ledger'
import { provider } from './providers'
import type { Actor } from '@/lib/auth/session'
import type {
  AccountType, CashAccount, CashTransfer, CheckStatus, FundingMethod, InvestorAccount,
} from '@/types/accounts'

/**
 * Investor accounts.
 *
 * The account is what an investor *has*; the profile is who they *are*. They
 * are separate because they answer to different things: a profile is edited by
 * the investor, an account's status is decided by checks that regulated
 * providers run and that expire on their own schedule.
 *
 * Each check is held separately rather than collapsed into one "verified"
 * flag. An investor blocked at accreditation and an investor blocked at
 * identity need to be told different things, and a single boolean cannot say
 * which they are.
 */

const CHECKS = ['identity_status', 'kyc_status', 'aml_status', 'tax_status'] as const

async function nextReference(): Promise<string> {
  const store = await db()
  return `ACC-${100_001 + (await store.count('investor_accounts'))}`
}

export async function accountFor(actor: Actor): Promise<InvestorAccount | null> {
  const store = await db()
  return store.selectOne('investor_accounts', { where: { company_id: actor.company.id } })
}

export async function cashAccountFor(accountId: string): Promise<CashAccount | null> {
  const store = await db()
  return store.selectOne('cash_accounts', { where: { account_id: accountId } })
}

/**
 * The account, refusing anything that is not ready to transact.
 *
 * The message says which check is holding them up, because "your account is
 * not active" tells an investor nothing they can act on.
 */
export async function requireActiveAccount(actor: Actor): Promise<InvestorAccount> {
  const account = await accountFor(actor)
  if (!account) throw new Error('This organisation does not have an investment account yet.')
  if (account.status === 'active') return account

  const blocked = CHECKS.filter((check) => account[check] !== 'passed')
  const detail = blocked.length > 0
    ? `Outstanding: ${blocked.map((c) => c.replace('_status', '')).join(', ')}.`
    : account.status_reason ?? ''
  authorize(false, `This account cannot transact yet. ${detail}`.trim())
  throw new Error('unreachable')
}

export interface OpenAccountInput {
  accountType: AccountType
  legalName: string
}

/**
 * Opens an account and its cash account together.
 *
 * One without the other is a state nothing in the product can use, so they are
 * never created separately.
 */
export async function openAccount(actor: Actor, input: OpenAccountInput): Promise<InvestorAccount> {
  authorize(isAvailable('INVESTOR_ACCOUNTS_ENABLED'), 'Investor accounts are not enabled.')
  authorize(
    actor.company.type === 'investor',
    'An investment account belongs to an investor organisation.',
  )
  authorize(input.legalName.trim().length >= 2, 'Enter the legal name for the account.')

  const store = await db()
  const existing = await accountFor(actor)
  if (existing) return existing

  const account = await store.insert('investor_accounts', {
    company_id: actor.company.id,
    investor_id: actor.investor?.id ?? null,
    account_type: input.accountType,
    legal_name: input.legalName.trim(),
    reference: await nextReference(),
    status: 'pending',
    identity_status: 'not_started',
    kyc_status: 'not_started',
    aml_status: 'not_started',
    accreditation_status: 'not_started',
    tax_status: 'not_started',
    activated_at: null,
    status_reason: 'Onboarding has not been completed.',
  } as Omit<InvestorAccount, 'id' | 'created_at' | 'updated_at'>)

  const cashProvider = provider('cashAccount')
  const opened = await cashProvider.openAccount(account.id, account.legal_name)
  await store.insert('cash_accounts', {
    account_id: account.id,
    currency: 'USD',
    provider: cashProvider.live ? cashProvider.name : null,
    provider_account_ref: opened.reference,
    status: 'open',
  } as Omit<CashAccount, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'account.opened', entityType: 'investor_account', entityId: account.id,
    summary: `${account.reference} opened for ${account.legal_name}.`,
  })
  return account
}

/**
 * Runs the checks an account needs and activates it when they all pass.
 *
 * Each provider answers for itself and the answers are stored separately. The
 * account becomes active only when nothing is outstanding — and if a check
 * comes back pending, the account says so rather than sitting silently.
 */
export async function runChecks(actor: Actor, accountId: string): Promise<InvestorAccount> {
  const store = await db()
  const account = await store.findById('investor_accounts', accountId)
  if (!account) throw new Error('Account not found.')
  authorize(
    actor.isAdmin || account.company_id === actor.company.id,
    'That account belongs to another organisation.',
  )

  const [kyc, aml, accreditation] = await Promise.all([
    provider('kyc').verify(account.id, account.legal_name),
    provider('aml').screen(account.id, account.legal_name),
    provider('accreditation').verify(
      account.id,
      actor.investor?.accreditation_basis ?? null,
    ),
  ])

  const patch: Partial<InvestorAccount> = {
    identity_status: kyc.status,
    kyc_status: kyc.status,
    aml_status: aml.status,
    accreditation_status: accreditation.status,
    // Nothing in this environment collects a tax form; saying it passed would
    // be the platform asserting something no provider told it.
    tax_status: account.tax_status === 'not_started' ? 'pending' : account.tax_status,
  }

  const required: CheckStatus[] = [patch.identity_status!, patch.kyc_status!, patch.aml_status!]
  const allPassed = required.every((status) => status === 'passed')
  const failed = required.some((status) => status === 'failed')

  const updated = await store.update('investor_accounts', accountId, {
    ...patch,
    status: failed ? 'action_required' : allPassed ? 'active' : 'action_required',
    activated_at: allPassed ? (account.activated_at ?? new Date().toISOString()) : null,
    status_reason: failed
      ? 'A required check did not pass. Our team will be in touch.'
      : allPassed ? null : 'A required check is still outstanding.',
  } as Partial<InvestorAccount>)

  await recordAudit({
    actor, action: 'account.checks_run', entityType: 'investor_account', entityId: accountId,
    summary: `Checks run on ${account.reference}: ${updated.status}.`,
    metadata: { kyc: kyc.status, aml: aml.status, accreditation: accreditation.status },
  })
  return updated
}

/**
 * Adds cash to an account.
 *
 * A deposit is pending until the provider says it cleared. In demo mode the
 * demo provider clears it immediately, which is the one place demo mode and
 * reality visibly differ — and the screens say so.
 */
export async function deposit(
  actor: Actor,
  amount: Cents,
  method: FundingMethod = 'demo',
): Promise<CashTransfer> {
  authorize(isAvailable('CASH_ACCOUNT_ENABLED'), 'Funding is not enabled on this deployment.')
  const account = await accountFor(actor)
  if (!account) throw new Error('This organisation does not have an investment account yet.')
  authorize(account.status !== 'suspended', 'This account is suspended.')
  authorize(amount > 0, 'Enter an amount to add.')

  const store = await db()
  const cash = await cashAccountFor(account.id)
  if (!cash) throw new Error('This account has no cash account.')
  authorize(cash.status === 'open', 'This cash account is not open.')

  const payments = provider('payment')
  const idempotencyKey = `deposit:${account.id}:${Date.now()}`
  const result = await payments.deposit(cash.provider_account_ref ?? cash.id, amount, idempotencyKey)

  const transfer = await store.insert('cash_transfers', {
    account_id: account.id,
    cash_account_id: cash.id,
    direction: 'deposit',
    amount_cents: amount,
    currency: 'USD',
    method,
    funding_source_id: null,
    status: result.ok ? 'processing' : 'failed',
    ledger_entry_id: null,
    provider: payments.name,
    provider_transfer_ref: result.reference,
    failure_reason: result.ok ? null : (result.detail ?? 'The payment provider declined it.'),
    requested_at: new Date().toISOString(),
    completed_at: null,
  } as Omit<CashTransfer, 'id' | 'created_at' | 'updated_at'>)

  if (!result.ok) return transfer

  // A demo provider settles at once; a real one will not, and the entry stays
  // pending until its webhook says otherwise.
  const settlesImmediately = !payments.live
  const entry = await post({
    accountId: account.id,
    cashAccountId: cash.id,
    type: 'deposit',
    amount,
    description: settlesImmediately ? `Deposit (${method})` : `Deposit (${method}), clearing`,
    idempotencyKey: `transfer:${transfer.id}`,
    status: settlesImmediately ? 'posted' : 'pending',
    referenceType: 'transfer',
    referenceId: transfer.id,
  })

  const completed = await store.update('cash_transfers', transfer.id, {
    status: settlesImmediately ? 'completed' : 'processing',
    ledger_entry_id: entry.id,
    completed_at: settlesImmediately ? new Date().toISOString() : null,
  } as Partial<CashTransfer>)

  await recordAudit({
    actor, action: 'cash.deposited', entityType: 'cash_transfer', entityId: transfer.id,
    summary: `${format(amount)} added to ${account.reference}.`,
    metadata: { method, provider: payments.name, live: payments.live },
  })
  return completed
}

/**
 * Takes cash out.
 *
 * The debit is written first and the provider called second, so a withdrawal
 * can never be sent for money the account did not have. If the provider
 * refuses, the reservation is released.
 */
export async function withdraw(actor: Actor, amount: Cents): Promise<CashTransfer> {
  authorize(isAvailable('CASH_ACCOUNT_ENABLED'), 'Withdrawals are not enabled on this deployment.')
  const account = await accountFor(actor)
  if (!account) throw new Error('This organisation does not have an investment account yet.')
  authorize(account.status === 'active', 'This account cannot move money yet.')
  authorize(amount > 0, 'Enter an amount to withdraw.')

  const store = await db()
  const cash = await cashAccountFor(account.id)
  if (!cash) throw new Error('This account has no cash account.')

  const transfer = await store.insert('cash_transfers', {
    account_id: account.id,
    cash_account_id: cash.id,
    direction: 'withdrawal',
    amount_cents: amount,
    currency: 'USD',
    method: 'demo',
    funding_source_id: null,
    status: 'requested',
    ledger_entry_id: null,
    provider: null,
    provider_transfer_ref: null,
    failure_reason: null,
    requested_at: new Date().toISOString(),
    completed_at: null,
  } as Omit<CashTransfer, 'id' | 'created_at' | 'updated_at'>)

  // Throws if the account cannot cover it, before any provider is asked.
  const entry = await post({
    accountId: account.id,
    cashAccountId: cash.id,
    type: 'withdrawal',
    amount: cents(-amount),
    description: 'Withdrawal',
    idempotencyKey: `transfer:${transfer.id}`,
    status: 'pending',
    referenceType: 'withdrawal',
    referenceId: transfer.id,
  })

  const payments = provider('payment')
  const result = await payments.withdraw(
    cash.provider_account_ref ?? cash.id, amount, `transfer:${transfer.id}`,
  )

  const updated = await store.update('cash_transfers', transfer.id, {
    status: result.ok ? 'processing' : 'failed',
    ledger_entry_id: entry.id,
    provider: payments.name,
    provider_transfer_ref: result.reference,
    failure_reason: result.ok ? null : (result.detail ?? 'The payment provider declined it.'),
  } as Partial<CashTransfer>)

  await recordAudit({
    actor, action: 'cash.withdrawal_requested', entityType: 'cash_transfer', entityId: transfer.id,
    summary: `${format(amount)} withdrawal requested from ${account.reference}.`,
  })
  return updated
}
