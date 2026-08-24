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
]

/** Tables that must never be updated or deleted through the ordinary data API. */
export const APPEND_ONLY_TABLES: TableName[] = ['audit_logs', 'document_access_logs', 'ai_usage_events']
