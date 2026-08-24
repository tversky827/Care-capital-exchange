/**
 * CareCapital Exchange — domain model.
 *
 * These types mirror the PostgreSQL schema in `supabase/migrations`. Every
 * table in the schema has a corresponding interface here, and the local
 * development store persists rows in exactly this shape so that the two
 * drivers stay interchangeable.
 */

export type UUID = string
export type ISODate = string

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type UserRole = 'borrower' | 'lender' | 'broker' | 'admin'
export type CompanyType = 'borrower' | 'lender' | 'broker' | 'admin'
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface User {
  id: UUID
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  password_hash: string | null
  mfa_enabled: boolean
  mfa_required: boolean
  status: 'active' | 'suspended' | 'pending'
  title: string | null
  last_login_at: ISODate | null
  notification_preferences: NotificationPreferences
  created_at: ISODate
  updated_at: ISODate
}

export interface NotificationPreferences {
  in_app: boolean
  email: boolean
  sms: boolean
  muted_events: string[]
}

export interface Company {
  id: UUID
  name: string
  type: CompanyType
  website: string | null
  description: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  status: 'active' | 'suspended'
  created_at: ISODate
  updated_at: ISODate
}

export interface CompanyMember {
  id: UUID
  company_id: UUID
  user_id: UUID
  role: MemberRole
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const DEAL_STATUSES = [
  'draft',
  'intake',
  'document_collection',
  'processing',
  'underwriting',
  'needs_attention',
  'ready_for_distribution',
  'distributed',
  'indications_received',
  'under_loi',
  'diligence',
  'closing',
  'funded',
  'withdrawn',
  'rejected',
  'archived',
] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const TRANSACTION_TYPES = [
  'acquisition',
  'refinance',
  'acquisition_refinance',
  'bridge',
  'construction',
  'capex',
  'working_capital',
  'recapitalization',
] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const ASSET_TYPES = [
  'snf',
  'alf',
  'memory_care',
  'behavioral_health',
  'medical_office',
  'hospital',
  'home_health',
  'hospice',
  'physician_practice',
  'dental_practice',
  'other',
] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export type DistributionScope =
  | 'private'
  | 'matched_lenders'
  | 'selected_lenders'
  | 'marketplace'
  | 'invite_only'

export type BorrowerPriority =
  | 'lowest_rate'
  | 'highest_leverage'
  | 'longest_term'
  | 'maximum_io'
  | 'lowest_fees'
  | 'non_recourse'
  | 'fastest_closing'
  | 'most_certainty'

export interface Deal {
  id: UUID
  reference: string
  company_id: UUID
  created_by: UUID
  name: string
  asset_type: AssetType
  transaction_type: TransactionType
  status: DealStatus
  distribution_scope: DistributionScope
  anonymize_in_marketplace: boolean
  borrower_priority: BorrowerPriority
  target_close_date: ISODate | null
  narrative: string | null
  is_demo: boolean
  distributed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Facility {
  id: UUID
  deal_id: UUID
  name: string
  address_line1: string | null
  city: string | null
  state: string
  zip: string | null
  county: string | null
  licensed_beds: number | null
  certified_beds: number | null
  operating_beds: number | null
  current_census: number | null
  occupancy_pct: number | null
  ownership_structure: string | null
  year_built: number | null
  last_renovation_year: number | null
  property_type: string | null
  real_estate_included: boolean
  operating_company: string | null
  management_company: string | null
  cms_star_rating: number | null
  created_at: ISODate
  updated_at: ISODate
}

/** Point-in-time operating statistics for a facility. */
export interface FacilityMetric {
  id: UUID
  facility_id: UUID
  deal_id: UUID
  period_label: string
  period_end: ISODate
  occupancy_pct: number | null
  average_census: number | null
  medicare_pct: number | null
  medicaid_pct: number | null
  private_pay_pct: number | null
  managed_care_pct: number | null
  other_payer_pct: number | null
  average_daily_rate: number | null
  revenue_per_patient_day: number | null
  labor_hours_per_patient_day: number | null
  agency_labor_pct: number | null
  created_at: ISODate
}

export type PeriodType = 'annual' | 'ttm' | 'quarter' | 'month' | 'ytd' | 'projection'

export interface FinancialPeriod {
  id: UUID
  deal_id: UUID
  label: string
  period_type: PeriodType
  fiscal_year: number
  start_date: ISODate
  end_date: ISODate
  source: 'manual' | 'extracted' | 'demo'
  is_primary: boolean
  created_at: ISODate
}

export const LINE_ITEM_KEYS = [
  'revenue',
  'ebitda',
  'ebitdar',
  'noi',
  'net_income',
  'labor_expense',
  'agency_labor',
  'rent',
  'utilities',
  'insurance',
  'taxes',
  'capex',
  'management_fee',
  'other_operating_expense',
  'total_operating_expense',
  'interest_expense',
  'depreciation',
] as const
export type LineItemKey = (typeof LINE_ITEM_KEYS)[number]

export interface FinancialLineItem {
  id: UUID
  period_id: UUID
  deal_id: UUID
  key: LineItemKey
  label: string
  value: number | null
  /** Value proposed by extraction but not yet approved by a human. */
  proposed_value: number | null
  approved_value: number | null
  approved_by: UUID | null
  approved_at: ISODate | null
  source_document_id: UUID | null
  source_page: number | null
  confidence: number | null
  created_at: ISODate
  updated_at: ISODate
}

export interface TransactionTerms {
  id: UUID
  deal_id: UUID
  purchase_price: number | null
  requested_financing: number | null
  existing_debt: number | null
  seller_financing: number | null
  cash_equity: number | null
  appraised_value: number | null
  estimated_closing_costs: number | null
  working_capital_requirement: number | null
  capex_requirement: number | null
  target_close_date: ISODate | null
  purchase_agreement_status: string | null
  loi_status: string | null
  requested_term_months: number | null
  requested_amortization_months: number | null
  requested_rate_pct: number | null
  requested_io_months: number | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Sponsor {
  id: UUID
  deal_id: UUID
  legal_entity: string
  years_in_healthcare: number | null
  years_operating_asset_type: number | null
  facilities_operated: number | null
  beds_operated: number | null
  states_operated: string[]
  historical_acquisitions: number | null
  previous_exits: number | null
  prior_defaults: boolean | null
  bankruptcy_history: boolean | null
  management_team: string | null
  key_executives: string | null
  net_worth: number | null
  liquidity: number | null
  relevant_experience: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface SponsorExperience {
  id: UUID
  sponsor_id: UUID
  facility_name: string
  state: string
  beds: number | null
  asset_type: AssetType
  role: string
  acquired_year: number | null
  exited_year: number | null
  notes: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const DOCUMENT_CATEGORIES = [
  'corporate',
  'financial',
  'facility',
  'transaction',
  'sponsor',
  'other',
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const DOCUMENT_TYPES = [
  'articles',
  'operating_agreement',
  'entity_chart',
  'ownership_document',
  'profit_and_loss',
  'balance_sheet',
  'cash_flow',
  'tax_return',
  'ar_aging',
  'ap_aging',
  'bank_statement',
  'census',
  'payer_mix',
  'cms_information',
  'license',
  'survey',
  'loi',
  'purchase_agreement',
  'appraisal',
  'environmental',
  'existing_debt',
  'resume',
  'personal_financial_statement',
  'reference',
  'other',
] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export type DocumentProcessingStatus =
  | 'uploaded'
  | 'scanning'
  | 'queued'
  | 'parsing'
  | 'extracting'
  | 'processed'
  | 'needs_ocr'
  | 'failed'
  | 'quarantined'

export interface DocumentRecord {
  id: UUID
  deal_id: UUID
  company_id: UUID
  category: DocumentCategory
  doc_type: DocumentType
  filename: string
  display_name: string
  mime_type: string
  size_bytes: number
  storage_key: string
  checksum: string
  uploaded_by: UUID
  version: number
  current_version_id: UUID | null
  processing_status: DocumentProcessingStatus
  extraction_status: 'pending' | 'running' | 'complete' | 'failed' | 'not_applicable'
  page_count: number | null
  malware_scan: 'pending' | 'clean' | 'infected' | 'skipped'
  /** Lender visibility. `restricted` documents never leave the borrower org. */
  visibility: 'deal_team' | 'distributed_lenders' | 'restricted'
  notes: string | null
  is_demo: boolean
  deleted_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface DocumentVersion {
  id: UUID
  document_id: UUID
  version: number
  storage_key: string
  size_bytes: number
  checksum: string
  uploaded_by: UUID
  created_at: ISODate
}

export interface DocumentPermission {
  id: UUID
  document_id: UUID
  company_id: UUID
  granted_by: UUID
  can_view: boolean
  can_download: boolean
  expires_at: ISODate | null
  created_at: ISODate
}

export interface DocumentAccessLog {
  id: UUID
  document_id: UUID
  deal_id: UUID
  user_id: UUID
  company_id: UUID
  action: 'view' | 'download' | 'preview' | 'denied'
  ip: string | null
  user_agent: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Extraction & reconciliation
// ---------------------------------------------------------------------------

export type ExtractionMethod =
  | 'structured_parse'
  | 'text_pattern'
  | 'llm'
  | 'ocr_llm'
  | 'manual'
  | 'demo_seed'

export interface ExtractionRun {
  id: UUID
  deal_id: UUID
  document_id: UUID | null
  status: 'queued' | 'running' | 'complete' | 'failed'
  method: ExtractionMethod
  model: string | null
  provider: string
  fields_extracted: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
  error: string | null
  raw_response: unknown
  created_at: ISODate
  completed_at: ISODate | null
}

export interface ExtractedField {
  id: UUID
  deal_id: UUID
  run_id: UUID
  document_id: UUID | null
  field_name: string
  value: string | null
  normalized_value: number | null
  unit: string | null
  year: number | null
  period: string | null
  page_number: number | null
  source_text: string | null
  confidence: number
  extraction_method: ExtractionMethod
  review_status: 'unreviewed' | 'approved' | 'rejected' | 'superseded'
  reviewed_by: UUID | null
  reviewed_at: ISODate | null
  created_at: ISODate
}

export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export const DISCREPANCY_CATEGORIES = [
  'revenue',
  'ebitda',
  'debt',
  'ownership',
  'census',
  'occupancy',
  'payer_mix',
  'dates',
  'missing_document',
  'unexpected_change',
  'other',
] as const
export type DiscrepancyCategory = (typeof DISCREPANCY_CATEGORIES)[number]

export interface Discrepancy {
  id: UUID
  deal_id: UUID
  severity: DiscrepancySeverity
  category: DiscrepancyCategory
  title: string
  description: string
  ai_explanation: string | null
  suggested_question: string | null
  document_ids: UUID[]
  conflicting_values: { label: string; value: string; source: string }[]
  status: 'open' | 'resolved' | 'ignored' | 'clarification_requested'
  detector_key: string
  created_at: ISODate
  updated_at: ISODate
}

export interface DiscrepancyResolution {
  id: UUID
  discrepancy_id: UUID
  deal_id: UUID
  resolved_by: UUID
  action: 'resolve' | 'ignore' | 'request_clarification'
  resolution_note: string
  accepted_value: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Underwriting
// ---------------------------------------------------------------------------

export interface UnderwritingRun {
  id: UUID
  deal_id: UUID
  triggered_by: UUID | null
  status: 'queued' | 'running' | 'complete' | 'failed'
  provider: string
  model: string | null
  overall_score: number | null
  confidence: number | null
  score_components: ScoreComponent[]
  analysis: CreditAnalysis | null
  input_fingerprint: string
  error: string | null
  duration_ms: number
  cost_usd: number
  created_at: ISODate
  completed_at: ISODate | null
}

export interface ScoreComponent {
  key: string
  label: string
  weight: number
  score: number
  rationale: string
  data_quality: 'complete' | 'partial' | 'missing'
}

export interface CreditAnalysis {
  overall_score: number
  strengths: string[]
  risks: AnalysisRisk[]
  questions: string[]
  missing_information: string[]
  potential_mitigants: string[]
  lender_considerations: string[]
  confidence: number
  summary: string
}

export interface AnalysisRisk {
  title: string
  severity: DiscrepancySeverity
  detail: string
  category: string
}

export interface UnderwritingMetric {
  id: UUID
  run_id: UUID
  deal_id: UUID
  key: string
  label: string
  value: number | null
  unit: 'ratio' | 'percent' | 'currency' | 'months' | 'count' | 'x'
  formula: string
  inputs: Record<string, number | null>
  is_derived: boolean
  created_at: ISODate
}

export interface UnderwritingRisk {
  id: UUID
  run_id: UUID
  deal_id: UUID
  severity: DiscrepancySeverity
  category: string
  title: string
  detail: string
  mitigant: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Credit memo
// ---------------------------------------------------------------------------

export interface CreditMemo {
  id: UUID
  deal_id: UUID
  current_version: number
  status: 'draft' | 'final'
  created_by: UUID
  created_at: ISODate
  updated_at: ISODate
}

export interface MemoSection {
  key: string
  title: string
  body: string
  citations: MemoCitation[]
}

export interface MemoCitation {
  marker: string
  label: string
  document_id: UUID | null
  page: number | null
  value: string | null
}

export interface CreditMemoVersion {
  id: UUID
  memo_id: UUID
  deal_id: UUID
  version: number
  sections: MemoSection[]
  generated_by: UUID
  generator: 'ai' | 'human_edit'
  underwriting_run_id: UUID | null
  notes: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Lenders
// ---------------------------------------------------------------------------

export type LenderVerification = 'pending' | 'verified' | 'suspended' | 'rejected'

export type LenderInstitutionType =
  | 'bank'
  | 'credit_union'
  | 'private_lender'
  | 'specialty_finance'
  | 'debt_fund'
  | 'insurance'
  | 'cmbs'
  | 'agency'
  | 'other'

export interface Lender {
  id: UUID
  company_id: UUID
  institution_name: string
  institution_type: LenderInstitutionType
  description: string | null
  logo_initials: string
  verification_status: LenderVerification
  verified_at: ISODate | null
  verified_by: UUID | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  /** Fields the lender allows borrowers to see on the public profile. */
  public_profile_fields: string[]
  responsiveness_score: number
  is_demo: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface LendingBox {
  id: UUID
  lender_id: UUID
  name: string
  active: boolean
  min_loan: number | null
  max_loan: number | null
  max_ltv_pct: number | null
  min_dscr: number | null
  min_debt_yield_pct: number | null
  min_occupancy_pct: number | null
  states: string[]
  excluded_states: string[]
  asset_types: AssetType[]
  excluded_asset_types: AssetType[]
  transaction_types: TransactionType[]
  min_operator_years: number | null
  min_facilities_operated: number | null
  max_medicaid_pct: number | null
  min_private_pay_pct: number | null
  preferred_deal_size: number | null
  loan_purposes: string[]
  typical_rate_low_pct: number | null
  typical_rate_high_pct: number | null
  typical_term_months: number | null
  requires_appraisal: boolean
  requires_environmental: boolean
  required_tax_return_years: number
  notes: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface LenderPreference {
  id: UUID
  lender_id: UUID
  user_id: UUID
  alerts_enabled: boolean
  alert_criteria: SavedSearchCriteria
  created_at: ISODate
}

export interface SavedSearchCriteria {
  states?: string[]
  asset_types?: AssetType[]
  transaction_types?: TransactionType[]
  min_loan?: number | null
  max_loan?: number | null
  max_ltv_pct?: number | null
  min_dscr?: number | null
  min_debt_yield_pct?: number | null
  min_occupancy_pct?: number | null
  max_medicaid_pct?: number | null
  query?: string
}

export interface SavedSearch {
  id: UUID
  user_id: UUID
  company_id: UUID
  name: string
  kind: 'lender_marketplace' | 'preferred_lenders'
  criteria: SavedSearchCriteria
  alert_enabled: boolean
  last_alert_at: ISODate | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Matching & distribution
// ---------------------------------------------------------------------------

export interface MatchFactor {
  key: string
  label: string
  status: 'pass' | 'concern' | 'fail' | 'unknown'
  weight: number
  score: number
  detail: string
}

export interface Match {
  id: UUID
  deal_id: UUID
  lender_id: UUID
  lending_box_id: UUID
  score: number
  band: 'strong' | 'good' | 'possible' | 'outside_box'
  hard_fail: boolean
  factors: MatchFactor[]
  ai_explanation: string | null
  concerns: string[]
  computed_at: ISODate
  created_at: ISODate
}

export type PipelineStage =
  | 'new_match'
  | 'reviewing'
  | 'requesting_information'
  | 'underwriting'
  | 'indication_submitted'
  | 'loi'
  | 'diligence'
  | 'credit_committee'
  | 'closing'
  | 'funded'
  | 'passed'

export interface DealDistribution {
  id: UUID
  deal_id: UUID
  lender_id: UUID
  match_id: UUID | null
  distributed_by: UUID
  scope: DistributionScope
  status: 'sent' | 'viewed' | 'passed' | 'engaged' | 'revoked'
  pipeline_stage: PipelineStage
  first_viewed_at: ISODate | null
  last_viewed_at: ISODate | null
  view_count: number
  passed_reason: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface LenderNote {
  id: UUID
  deal_id: UUID
  lender_id: UUID
  author_id: UUID
  body: string
  created_at: ISODate
  updated_at: ISODate
}

// ---------------------------------------------------------------------------
// Indications
// ---------------------------------------------------------------------------

export type RecourseType = 'full_recourse' | 'partial_recourse' | 'non_recourse'
export type RateType = 'fixed' | 'floating'

export interface Indication {
  id: UUID
  deal_id: UUID
  lender_id: UUID
  submitted_by: UUID
  version: number
  status: 'submitted' | 'updated' | 'withdrawn' | 'expired' | 'selected' | 'declined'
  loan_amount: number
  rate_type: RateType
  index_name: string | null
  index_rate_pct: number | null
  spread_pct: number | null
  all_in_rate_pct: number
  term_months: number
  amortization_months: number
  interest_only_months: number
  origination_fee_pct: number
  exit_fee_pct: number
  prepayment_terms: string | null
  recourse: RecourseType
  guarantees: string | null
  covenants: string | null
  closing_timeline_days: number | null
  expires_at: ISODate | null
  additional_terms: string | null
  is_commitment: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface IndicationCondition {
  id: UUID
  indication_id: UUID
  deal_id: UUID
  label: string
  detail: string | null
  kind: 'condition' | 'covenant' | 'diligence_item'
  satisfied: boolean
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export interface MessageThread {
  id: UUID
  deal_id: UUID
  subject: string
  kind: 'lender_question' | 'deal_team' | 'data_request' | 'admin'
  /** Companies allowed to read the thread. Enforced in the policy layer + RLS. */
  participant_company_ids: UUID[]
  lender_id: UUID | null
  created_by: UUID
  status: 'open' | 'answered' | 'closed'
  created_at: ISODate
  updated_at: ISODate
}

export interface Message {
  id: UUID
  thread_id: UUID
  deal_id: UUID
  author_id: UUID
  author_company_id: UUID
  body: string
  attachments: UUID[]
  created_at: ISODate
}

export interface DataRequest {
  id: UUID
  deal_id: UUID
  lender_id: UUID | null
  requested_by: UUID
  label: string
  detail: string | null
  doc_type: DocumentType
  source: 'ai_recommendation' | 'lender_requirement' | 'manual'
  status: 'open' | 'fulfilled' | 'waived'
  fulfilled_document_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Notification {
  id: UUID
  user_id: UUID
  company_id: UUID
  deal_id: UUID | null
  event: string
  title: string
  body: string
  href: string | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  read_at: ISODate | null
  emailed_at: ISODate | null
  created_at: ISODate
}

export interface AuditLog {
  id: UUID
  actor_id: UUID | null
  actor_company_id: UUID | null
  deal_id: UUID | null
  entity_type: string
  entity_id: string | null
  action: string
  summary: string
  metadata: Record<string, unknown>
  ip: string | null
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Jobs & billing
// ---------------------------------------------------------------------------

export interface Job {
  id: UUID
  kind: string
  payload: Record<string, unknown>
  deal_id: UUID | null
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead'
  attempts: number
  max_attempts: number
  last_error: string | null
  scheduled_at: ISODate
  started_at: ISODate | null
  finished_at: ISODate | null
  duration_ms: number | null
  created_at: ISODate
}

export interface Subscription {
  id: UUID
  company_id: UUID
  plan_key: string
  status: 'trialing' | 'active' | 'past_due' | 'canceled'
  seats: number
  current_period_end: ISODate | null
  external_id: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface BillingEvent {
  id: UUID
  company_id: UUID
  deal_id: UUID | null
  kind: 'subscription_created' | 'invoice_paid' | 'transaction_fee' | 'success_fee' | 'refund'
  amount_usd: number
  description: string
  external_id: string | null
  metadata: Record<string, unknown>
  created_at: ISODate
}

export interface AiUsageEvent {
  id: UUID
  deal_id: UUID | null
  task: string
  provider: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
  success: boolean
  created_at: ISODate
}
