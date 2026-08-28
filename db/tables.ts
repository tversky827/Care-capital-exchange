/**
 * Table registry. The string keys match the PostgreSQL table names created by
 * `supabase/migrations/0001_init.sql`, so the local and Supabase drivers can be
 * swapped without touching call sites.
 */
import type {
  AiUsageEvent, AuditLog, BillingEvent, Company, CompanyMember, CreditMemo, CreditMemoVersion,
  DataRequest, Deal, DealDistribution, Discrepancy, DiscrepancyResolution, DocumentAccessLog,
  DocumentPermission, DocumentRecord, DocumentVersion, ExtractedField, ExtractionRun, Facility,
  FacilityMetric, FinancialLineItem, FinancialPeriod, Indication, IndicationCondition, Job, Lender,
  LenderNote, LenderPreference, LendingBox, Match, Message, MessageThread, Notification,
  SavedSearch, Sponsor, SponsorExperience, Subscription, TransactionTerms, UnderwritingMetric,
  UnderwritingRisk, UnderwritingRun, User,
} from '@/types'
import type {
  CapitalSource, CapitalStack, ComplianceReview, DisclosureAcknowledgement, DistributionEvent,
  InvestmentCommitment, InvestmentDistribution, InvestmentInterest, InvestmentPosition,
  InvestmentScenario, InvestmentTransaction, InvestorAnswer, InvestorMatch, InvestorPreferences,
  InvestorProfile, InvestorQuestion, InvestorUpdate, InvestorVerification, NdaAcceptance, Offering,
  OfferingDisclosure, OfferingDocument, OfferingEligibility, OfferingTerms, OfferingVersion,
  RiskAssessment, SavedInvestment, TaxDocument, WaterfallStructure, WaterfallTier,
} from '@/types/equity'
import type {
  CashAccount, CashLedgerEntry, CashTransfer, FundingSource, InvestmentOrder, InvestorAccount,
  ProviderAccount, ProviderTransaction,
} from '@/types/accounts'

export interface Tables {
  users: User
  companies: Company
  company_members: CompanyMember
  deals: Deal
  facilities: Facility
  facility_metrics: FacilityMetric
  financial_periods: FinancialPeriod
  financial_line_items: FinancialLineItem
  transaction_terms: TransactionTerms
  sponsors: Sponsor
  sponsor_experience: SponsorExperience
  documents: DocumentRecord
  document_versions: DocumentVersion
  document_permissions: DocumentPermission
  document_access_logs: DocumentAccessLog
  extraction_runs: ExtractionRun
  extracted_fields: ExtractedField
  discrepancies: Discrepancy
  discrepancy_resolutions: DiscrepancyResolution
  underwriting_runs: UnderwritingRun
  underwriting_metrics: UnderwritingMetric
  underwriting_risks: UnderwritingRisk
  credit_memos: CreditMemo
  credit_memo_versions: CreditMemoVersion
  lenders: Lender
  lender_lending_boxes: LendingBox
  lender_preferences: LenderPreference
  lender_notes: LenderNote
  saved_searches: SavedSearch
  matches: Match
  deal_distributions: DealDistribution
  indications: Indication
  indication_conditions: IndicationCondition
  message_threads: MessageThread
  messages: Message
  data_requests: DataRequest
  notifications: Notification
  audit_logs: AuditLog
  jobs: Job
  subscriptions: Subscription
  billing_events: BillingEvent
  ai_usage_events: AiUsageEvent

  // --- equity marketplace ---------------------------------------------------
  investor_profiles: InvestorProfile
  investor_preferences: InvestorPreferences
  investor_verifications: InvestorVerification
  offerings: Offering
  offering_terms: OfferingTerms
  offering_eligibility: OfferingEligibility
  offering_disclosures: OfferingDisclosure
  offering_documents: OfferingDocument
  offering_versions: OfferingVersion
  disclosure_acknowledgements: DisclosureAcknowledgement
  nda_acceptances: NdaAcceptance
  investor_accounts: InvestorAccount
  cash_accounts: CashAccount
  cash_ledger_entries: CashLedgerEntry
  cash_transfers: CashTransfer
  funding_sources: FundingSource
  investment_orders: InvestmentOrder
  provider_accounts: ProviderAccount
  provider_transactions: ProviderTransaction
  investment_interests: InvestmentInterest
  investment_commitments: InvestmentCommitment
  investment_transactions: InvestmentTransaction
  investment_positions: InvestmentPosition
  distribution_events: DistributionEvent
  investment_distributions: InvestmentDistribution
  waterfall_structures: WaterfallStructure
  waterfall_tiers: WaterfallTier
  investor_updates: InvestorUpdate
  tax_documents: TaxDocument
  investor_questions: InvestorQuestion
  investor_answers: InvestorAnswer
  risk_assessments: RiskAssessment
  investment_scenarios: InvestmentScenario
  capital_stacks: CapitalStack
  capital_sources: CapitalSource
  investor_matches: InvestorMatch
  saved_investments: SavedInvestment
  compliance_reviews: ComplianceReview
}

export type TableName = keyof Tables

export const TABLE_NAMES: TableName[] = [
  'users', 'companies', 'company_members', 'deals', 'facilities', 'facility_metrics',
  'financial_periods', 'financial_line_items', 'transaction_terms', 'sponsors',
  'sponsor_experience', 'documents', 'document_versions', 'document_permissions',
  'document_access_logs', 'extraction_runs', 'extracted_fields', 'discrepancies',
  'discrepancy_resolutions', 'underwriting_runs', 'underwriting_metrics', 'underwriting_risks',
  'credit_memos', 'credit_memo_versions', 'lenders', 'lender_lending_boxes', 'lender_preferences',
  'lender_notes', 'saved_searches', 'matches', 'deal_distributions', 'indications',
  'indication_conditions', 'message_threads', 'messages', 'data_requests', 'notifications',
  'audit_logs', 'jobs', 'subscriptions', 'billing_events', 'ai_usage_events',
  'investor_profiles', 'investor_preferences', 'investor_verifications', 'offerings',
  'offering_terms', 'offering_eligibility', 'offering_disclosures', 'offering_documents',
  'offering_versions', 'disclosure_acknowledgements', 'investment_interests',
  'investment_commitments', 'investment_transactions', 'investment_positions',
  'distribution_events', 'investment_distributions', 'waterfall_structures', 'waterfall_tiers',
  'investor_updates', 'tax_documents', 'investor_questions', 'investor_answers',
  'risk_assessments', 'investment_scenarios', 'capital_stacks', 'capital_sources',
  'investor_matches', 'saved_investments', 'compliance_reviews', 'nda_acceptances',
  'investor_accounts', 'cash_accounts', 'cash_ledger_entries', 'cash_transfers',
  'funding_sources', 'investment_orders', 'provider_accounts', 'provider_transactions',
]

/** Tables that must never be updated or deleted through the ordinary data API. */
export const APPEND_ONLY_TABLES: TableName[] = [
  'audit_logs', 'document_access_logs', 'ai_usage_events',
  // An acknowledgement is evidence that a person accepted specific words at a
  // specific time. Editing one would destroy the only thing it is for.
  'disclosure_acknowledgements', 'offering_versions',
  // The same reasoning: a countersigned agreement that can be edited is not
  // evidence of anything.
  'nda_acceptances',
  // `cash_ledger_entries` is deliberately NOT listed here, and the reason is
  // worth stating because it looks like an omission.
  //
  // A ledger entry's amount, type, account and idempotency key are immutable —
  // a balance derived from editable history cannot be reconciled against a
  // provider, and a mistake is corrected by posting a reversing entry. But an
  // entry's `status` legitimately advances: a deposit is recorded when it is
  // instructed and posts when it clears, and that is one event arriving in two
  // parts rather than a rewrite of history.
  //
  // This flag is all-or-nothing, so it cannot express "every column but one".
  // The real rule is enforced where it can be exact: `services/accounts/ledger`
  // exposes no way to change anything but status, and migration 0006 installs
  // a trigger that rejects an UPDATE touching any other column — which holds
  // even against something writing SQL directly.
]
