import { log } from '@/lib/observability'
import type { VerificationKind, VerificationStatus } from '@/types/equity'

/**
 * External provider seams for the equity marketplace.
 *
 * CareCapital does not verify accreditation, screen for money laundering,
 * custody assets, transfer securities or move money. Regulated firms do those
 * things. This module defines the shape of each conversation so a real
 * provider can be attached without the product being rebuilt around it, and
 * ships a development implementation so the workflow is explorable today.
 *
 * Two rules hold for every implementation here:
 *
 *  1. The development implementations never touch real money, real identity
 *     documents or a real securities transaction. They say so in their names
 *     and in what they return, so a demo cannot be mistaken for the real thing.
 *
 *  2. No verdict is invented. A mock returns a clearly-labelled demo result;
 *     it never returns "verified" in a way that a production code path would
 *     be entitled to trust.
 */

// ---------------------------------------------------------------------------
// Verification, know-your-customer, anti-money-laundering
// ---------------------------------------------------------------------------

export interface VerificationRequest {
  investorId: string
  kind: VerificationKind
  /** Provider-facing reference. Never a document, never an identifier. */
  reference: string
}

export interface VerificationOutcome {
  status: VerificationStatus
  provider: string
  providerReference: string | null
  detail: string | null
  verifiedAt: string | null
  expiresAt: string | null
}

/**
 * Identity, KYC and AML screening.
 *
 * Deliberately one interface rather than three: the providers in this market
 * (Persona, Alloy, Parallel Markets, Jumio and others) bundle these
 * differently, and an adapter should be free to satisfy all three from one
 * call or three.
 */
export interface InvestorVerificationService {
  readonly name: string
  /** Whether this deployment can actually perform the check. */
  readonly live: boolean
  start(request: VerificationRequest): Promise<VerificationOutcome>
  status(investorId: string, kind: VerificationKind): Promise<VerificationOutcome | null>
}

/**
 * Development verification.
 *
 * Clears identity and KYC immediately so the demo workflow runs, and leaves
 * accreditation pending until an administrator resolves it — which is closer
 * to how a real accreditation review behaves, and keeps the "pending" branch
 * of the eligibility engine on the demo path where it can be seen working.
 */
class DemoVerificationService implements InvestorVerificationService {
  readonly name = 'demo-verification'
  readonly live = false

  async start(request: VerificationRequest): Promise<VerificationOutcome> {
    log.info('demo verification requested', { kind: request.kind })
    const now = new Date().toISOString()
    const immediate: VerificationKind[] = ['identity', 'kyc', 'aml']
    if (immediate.includes(request.kind)) {
      return {
        status: 'verified',
        provider: this.name,
        providerReference: `demo-${request.kind}`,
        detail: 'Demonstration result. No identity check was performed.',
        verifiedAt: now,
        expiresAt: null,
      }
    }
    return {
      status: 'pending',
      provider: this.name,
      providerReference: `demo-${request.kind}`,
      detail: 'Demonstration result. Accreditation is left pending for review.',
      verifiedAt: null,
      expiresAt: null,
    }
  }

  async status(): Promise<VerificationOutcome | null> {
    return null
  }
}

let verificationService: InvestorVerificationService = new DemoVerificationService()

export function setVerificationService(service: InvestorVerificationService): void {
  verificationService = service
}

export function getVerificationService(): InvestorVerificationService {
  return verificationService
}

// ---------------------------------------------------------------------------
// Securities transactions
// ---------------------------------------------------------------------------

export interface EligibilitySummary {
  eligible: boolean
  reason: string | null
}

export interface SubscriptionRequest {
  commitmentId: string
  offeringId: string
  investorId: string
  amount: number
}

export interface TransactionRecord {
  provider: string
  providerReference: string | null
  status: 'not_started' | 'pending' | 'processing' | 'settled' | 'failed' | 'cancelled'
  detail: string | null
}

/**
 * The securities transaction itself.
 *
 * Every method here is a request to a regulated party — a broker-dealer, a
 * funding portal, a custodian or a transfer agent. CareCapital implements none
 * of them. `processPayment` in particular is a handoff, never a transfer: no
 * implementation in this repository moves money, and any that did would belong
 * to a firm licensed to.
 */
export interface InvestmentTransactionService {
  readonly name: string
  /** False for every implementation that cannot lawfully settle a transaction. */
  readonly live: boolean
  checkEligibility(request: SubscriptionRequest): Promise<EligibilitySummary>
  startApplication(request: SubscriptionRequest): Promise<TransactionRecord>
  verifyInvestor(investorId: string): Promise<EligibilitySummary>
  createSubscription(request: SubscriptionRequest): Promise<TransactionRecord>
  submitCommitment(request: SubscriptionRequest): Promise<TransactionRecord>
  processPayment(request: SubscriptionRequest): Promise<TransactionRecord>
  generateConfirmation(commitmentId: string): Promise<string>
  getTransactionStatus(commitmentId: string): Promise<TransactionRecord | null>
  cancelTransaction(commitmentId: string, reason: string): Promise<TransactionRecord>
}

/**
 * Development transaction service.
 *
 * Records the workflow and settles nothing. Every record it returns is marked
 * as a demonstration, and `live` is false, which is what the commitment
 * service checks before it will describe an investment as funded.
 */
class DemoTransactionService implements InvestmentTransactionService {
  readonly name = 'demo-transaction'
  readonly live = false

  private readonly records = new Map<string, TransactionRecord>()

  private record(commitmentId: string, status: TransactionRecord['status'], detail: string): TransactionRecord {
    const record: TransactionRecord = {
      provider: this.name,
      providerReference: `demo-${commitmentId.slice(0, 8)}`,
      status,
      detail,
    }
    this.records.set(commitmentId, record)
    return record
  }

  async checkEligibility(): Promise<EligibilitySummary> {
    // The platform's own eligibility engine is the authority here; a real
    // provider would apply its own rules on top and could still decline.
    return { eligible: true, reason: null }
  }

  async startApplication(request: SubscriptionRequest): Promise<TransactionRecord> {
    return this.record(request.commitmentId, 'pending', 'Demonstration application. No securities transaction was created.')
  }

  async verifyInvestor(): Promise<EligibilitySummary> {
    return { eligible: true, reason: null }
  }

  async createSubscription(request: SubscriptionRequest): Promise<TransactionRecord> {
    return this.record(request.commitmentId, 'pending', 'Demonstration subscription. No agreement was executed.')
  }

  async submitCommitment(request: SubscriptionRequest): Promise<TransactionRecord> {
    return this.record(request.commitmentId, 'processing', 'Demonstration commitment. Nothing was submitted to a broker-dealer.')
  }

  async processPayment(request: SubscriptionRequest): Promise<TransactionRecord> {
    log.info('demo payment handoff', { amount: request.amount })
    return this.record(request.commitmentId, 'settled', 'Demonstration settlement. No money moved.')
  }

  async generateConfirmation(commitmentId: string): Promise<string> {
    return `Demonstration confirmation for commitment ${commitmentId}. This is not a security, a receipt, or evidence of any transaction.`
  }

  async getTransactionStatus(commitmentId: string): Promise<TransactionRecord | null> {
    return this.records.get(commitmentId) ?? null
  }

  async cancelTransaction(commitmentId: string, reason: string): Promise<TransactionRecord> {
    return this.record(commitmentId, 'cancelled', `Demonstration cancellation: ${reason}`)
  }
}

let transactionService: InvestmentTransactionService = new DemoTransactionService()

export function setTransactionService(service: InvestmentTransactionService): void {
  transactionService = service
}

export function getTransactionService(): InvestmentTransactionService {
  return transactionService
}

// ---------------------------------------------------------------------------
// The remaining regulated roles
//
// Named as interfaces so the shape of each integration is settled before one
// is needed, and so nothing in the product reaches for a capability the
// platform does not have. None has a production implementation here.
// ---------------------------------------------------------------------------

export interface BrokerDealerService {
  readonly name: string
  readonly live: boolean
  /** Whether the firm has accepted this offering onto its platform. */
  offeringAccepted(offeringId: string): Promise<boolean>
}

export interface FundingPortalService {
  readonly name: string
  readonly live: boolean
  portalUrlFor(offeringId: string): Promise<string | null>
}

export interface CustodianService {
  readonly name: string
  readonly live: boolean
  accountFor(investorId: string): Promise<string | null>
}

export interface TransferAgentService {
  readonly name: string
  readonly live: boolean
  /** Records a holding on the issuer's books. */
  recordPosition(offeringId: string, investorId: string, amount: number): Promise<string | null>
}

export interface TaxDocumentService {
  readonly name: string
  readonly live: boolean
  /** Whether a document for this investor, offering and year is ready. */
  available(investorId: string, offeringId: string, taxYear: number): Promise<boolean>
}

/**
 * Whether this deployment can conduct a real securities transaction end to
 * end. Used to decide what the product is allowed to claim happened.
 */
export function transactionsAreLive(): boolean {
  return getTransactionService().live
}
