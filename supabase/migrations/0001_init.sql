-- ============================================================================
-- CareCapital Exchange — schema
--
-- Design notes:
--   * Financial data is normalised. `financial_line_items` is one row per
--     (period, line item), not a JSON blob, so a figure can be indexed,
--     aggregated, approved individually and traced to its source document.
--   * JSONB is used only where the shape is genuinely open: AI output, match
--     factor explanations, audit metadata, and model responses.
--   * Money is `numeric(16,2)` throughout. Ratios and percentages are
--     `numeric(9,4)`. No floating point anywhere a dollar is stored.
--   * Every table that a user can reach carries the columns RLS needs to make
--     a decision without a recursive lookup.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

create type user_role as enum ('borrower', 'lender', 'broker', 'admin');
create type company_type as enum ('borrower', 'lender', 'broker', 'admin');
create type member_role as enum ('owner', 'admin', 'member', 'viewer');
create type account_status as enum ('active', 'suspended', 'pending');

create type deal_status as enum (
  'draft', 'intake', 'document_collection', 'processing', 'underwriting',
  'needs_attention', 'ready_for_distribution', 'distributed', 'indications_received',
  'under_loi', 'diligence', 'closing', 'funded', 'withdrawn', 'rejected', 'archived'
);

create type transaction_type as enum (
  'acquisition', 'refinance', 'acquisition_refinance', 'bridge', 'construction',
  'capex', 'working_capital', 'recapitalization'
);

create type asset_type as enum (
  'snf', 'alf', 'memory_care', 'behavioral_health', 'medical_office', 'hospital',
  'home_health', 'hospice', 'physician_practice', 'dental_practice', 'other'
);

create type distribution_scope as enum (
  'private', 'matched_lenders', 'selected_lenders', 'marketplace', 'invite_only'
);

create type borrower_priority as enum (
  'lowest_rate', 'highest_leverage', 'longest_term', 'maximum_io', 'lowest_fees',
  'non_recourse', 'fastest_closing', 'most_certainty'
);

create type period_type as enum ('annual', 'ttm', 'quarter', 'month', 'ytd', 'projection');

create type document_category as enum ('corporate', 'financial', 'facility', 'transaction', 'sponsor', 'other');

create type document_type as enum (
  'articles', 'operating_agreement', 'entity_chart', 'ownership_document',
  'profit_and_loss', 'balance_sheet', 'cash_flow', 'tax_return', 'ar_aging', 'ap_aging',
  'bank_statement', 'census', 'payer_mix', 'cms_information', 'license', 'survey',
  'loi', 'purchase_agreement', 'appraisal', 'environmental', 'existing_debt',
  'resume', 'personal_financial_statement', 'reference', 'other'
);

create type processing_status as enum (
  'uploaded', 'scanning', 'queued', 'parsing', 'extracting', 'processed',
  'needs_ocr', 'failed', 'quarantined'
);

create type extraction_status as enum ('pending', 'running', 'complete', 'failed', 'not_applicable');
create type malware_status as enum ('pending', 'clean', 'infected', 'skipped');
create type document_visibility as enum ('deal_team', 'distributed_lenders', 'restricted');
create type document_action as enum ('view', 'download', 'preview', 'denied');

create type extraction_method as enum (
  'structured_parse', 'text_pattern', 'llm', 'ocr_llm', 'manual', 'demo_seed'
);
create type review_status as enum ('unreviewed', 'approved', 'rejected', 'superseded');

create type severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type discrepancy_category as enum (
  'revenue', 'ebitda', 'debt', 'ownership', 'census', 'occupancy', 'payer_mix',
  'dates', 'missing_document', 'unexpected_change', 'other'
);
create type discrepancy_status as enum ('open', 'resolved', 'ignored', 'clarification_requested');
create type resolution_action as enum ('resolve', 'ignore', 'request_clarification');

create type run_status as enum ('queued', 'running', 'complete', 'failed');
create type memo_status as enum ('draft', 'final');
create type memo_generator as enum ('ai', 'human_edit');

create type lender_verification as enum ('pending', 'verified', 'suspended', 'rejected');
create type lender_institution_type as enum (
  'bank', 'credit_union', 'private_lender', 'specialty_finance', 'debt_fund',
  'insurance', 'cmbs', 'agency', 'other'
);

create type match_band as enum ('strong', 'good', 'possible', 'outside_box');
create type distribution_status as enum ('sent', 'viewed', 'passed', 'engaged', 'revoked');
create type pipeline_stage as enum (
  'new_match', 'reviewing', 'requesting_information', 'underwriting', 'indication_submitted',
  'loi', 'diligence', 'credit_committee', 'closing', 'funded', 'passed'
);

create type indication_status as enum ('submitted', 'updated', 'withdrawn', 'expired', 'selected', 'declined');
create type rate_type as enum ('fixed', 'floating');
create type recourse_type as enum ('full_recourse', 'partial_recourse', 'non_recourse');
create type condition_kind as enum ('condition', 'covenant', 'diligence_item');

create type thread_kind as enum ('lender_question', 'deal_team', 'data_request', 'admin');
create type thread_status as enum ('open', 'answered', 'closed');
create type data_request_source as enum ('ai_recommendation', 'lender_requirement', 'manual');
create type data_request_status as enum ('open', 'fulfilled', 'waived');
create type notification_severity as enum ('info', 'success', 'warning', 'critical');

create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type billing_event_kind as enum (
  'subscription_created', 'invoice_paid', 'transaction_fee', 'success_fee', 'refund'
);
create type saved_search_kind as enum ('lender_marketplace', 'preferred_lenders');
create type metric_unit as enum ('ratio', 'percent', 'currency', 'months', 'count', 'x');
create type data_quality as enum ('complete', 'partial', 'missing');
create type financial_source as enum ('manual', 'extracted', 'demo');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  phone text,
  role user_role not null default 'borrower',
  -- Null when authentication is delegated to Supabase Auth.
  password_hash text,
  mfa_enabled boolean not null default false,
  mfa_required boolean not null default false,
  status account_status not null default 'active',
  title text,
  last_login_at timestamptz,
  notification_preferences jsonb not null default
    '{"in_app": true, "email": true, "sms": false, "muted_events": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type company_type not null,
  website text,
  description text,
  address_line1 text,
  city text,
  state text,
  zip text,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_idx on company_members(user_id);
create index company_members_company_idx on company_members(company_id);

-- ---------------------------------------------------------------------------
-- Deals
-- ---------------------------------------------------------------------------

create table deals (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid not null references users(id),
  name text not null,
  asset_type asset_type not null default 'snf',
  transaction_type transaction_type not null,
  status deal_status not null default 'draft',
  distribution_scope distribution_scope not null default 'private',
  anonymize_in_marketplace boolean not null default true,
  borrower_priority borrower_priority not null default 'lowest_rate',
  target_close_date timestamptz,
  narrative text,
  is_demo boolean not null default false,
  distributed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deals_company_idx on deals(company_id);
create index deals_status_idx on deals(status);
create index deals_marketplace_idx on deals(distribution_scope, status) where distributed_at is not null;

create table facilities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  name text not null,
  address_line1 text,
  city text,
  state text not null,
  zip text,
  county text,
  licensed_beds integer check (licensed_beds is null or licensed_beds >= 0),
  certified_beds integer check (certified_beds is null or certified_beds >= 0),
  operating_beds integer check (operating_beds is null or operating_beds >= 0),
  current_census integer check (current_census is null or current_census >= 0),
  occupancy_pct numeric(9,4),
  ownership_structure text,
  year_built integer,
  last_renovation_year integer,
  property_type text,
  real_estate_included boolean not null default true,
  operating_company text,
  management_company text,
  cms_star_rating integer check (cms_star_rating is null or cms_star_rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index facilities_deal_idx on facilities(deal_id);
create index facilities_state_idx on facilities(state);

create table facility_metrics (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  period_label text not null,
  period_end date not null,
  occupancy_pct numeric(9,4),
  average_census numeric(9,2),
  medicare_pct numeric(9,4),
  medicaid_pct numeric(9,4),
  private_pay_pct numeric(9,4),
  managed_care_pct numeric(9,4),
  other_payer_pct numeric(9,4),
  average_daily_rate numeric(12,2),
  revenue_per_patient_day numeric(12,2),
  labor_hours_per_patient_day numeric(9,2),
  agency_labor_pct numeric(9,4),
  created_at timestamptz not null default now(),
  unique (deal_id, period_label)
);

create index facility_metrics_deal_idx on facility_metrics(deal_id);

create table financial_periods (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  label text not null,
  period_type period_type not null default 'annual',
  fiscal_year integer not null,
  start_date date not null,
  end_date date not null,
  source financial_source not null default 'manual',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (deal_id, label)
);

create index financial_periods_deal_idx on financial_periods(deal_id);

create table financial_line_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references financial_periods(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  key text not null,
  label text not null,
  -- `value` is the working figure. `proposed_value` is what extraction
  -- suggested. `approved_value` is what a person signed off on and is the
  -- figure of record; the application never overwrites it automatically.
  value numeric(16,2),
  proposed_value numeric(16,2),
  approved_value numeric(16,2),
  approved_by uuid references users(id),
  approved_at timestamptz,
  source_document_id uuid,
  source_page integer,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, key)
);

create index financial_line_items_deal_idx on financial_line_items(deal_id);
create index financial_line_items_period_idx on financial_line_items(period_id);
create index financial_line_items_pending_idx on financial_line_items(deal_id)
  where approved_value is null and proposed_value is not null;

create table transaction_terms (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade unique,
  purchase_price numeric(16,2),
  requested_financing numeric(16,2),
  existing_debt numeric(16,2),
  seller_financing numeric(16,2),
  cash_equity numeric(16,2),
  appraised_value numeric(16,2),
  estimated_closing_costs numeric(16,2),
  working_capital_requirement numeric(16,2),
  capex_requirement numeric(16,2),
  target_close_date timestamptz,
  purchase_agreement_status text,
  loi_status text,
  requested_term_months integer,
  requested_amortization_months integer,
  requested_rate_pct numeric(9,4),
  requested_io_months integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade unique,
  legal_entity text not null,
  years_in_healthcare integer,
  years_operating_asset_type integer,
  facilities_operated integer,
  beds_operated integer,
  states_operated text[] not null default '{}',
  historical_acquisitions integer,
  previous_exits integer,
  prior_defaults boolean,
  bankruptcy_history boolean,
  management_team text,
  key_executives text,
  net_worth numeric(16,2),
  liquidity numeric(16,2),
  relevant_experience text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sponsor_experience (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors(id) on delete cascade,
  facility_name text not null,
  state text not null,
  beds integer,
  asset_type asset_type not null default 'snf',
  role text not null,
  acquired_year integer,
  exited_year integer,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  category document_category not null default 'other',
  doc_type document_type not null default 'other',
  filename text not null,
  display_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_key text not null,
  checksum text not null,
  uploaded_by uuid not null references users(id),
  version integer not null default 1,
  current_version_id uuid,
  processing_status processing_status not null default 'queued',
  extraction_status extraction_status not null default 'pending',
  page_count integer,
  malware_scan malware_status not null default 'pending',
  visibility document_visibility not null default 'distributed_lenders',
  notes text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_deal_idx on documents(deal_id) where deleted_at is null;
create index documents_company_idx on documents(company_id);

alter table financial_line_items
  add constraint financial_line_items_source_document_fk
  foreign key (source_document_id) references documents(id) on delete set null;

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version integer not null,
  storage_key text not null,
  size_bytes bigint not null,
  checksum text not null,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  granted_by uuid not null references users(id),
  can_view boolean not null default true,
  can_download boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, company_id)
);

-- Append-only: see the RLS policies in 0002_rls.sql.
create table document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  user_id uuid not null references users(id),
  company_id uuid not null references companies(id),
  action document_action not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index document_access_logs_document_idx on document_access_logs(document_id, created_at desc);
create index document_access_logs_deal_idx on document_access_logs(deal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Extraction and reconciliation
-- ---------------------------------------------------------------------------

create table extraction_runs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  status run_status not null default 'queued',
  method extraction_method not null,
  model text,
  provider text not null,
  fields_extracted integer not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  duration_ms integer not null default 0,
  error text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index extraction_runs_deal_idx on extraction_runs(deal_id, created_at desc);

create table extracted_fields (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  run_id uuid not null references extraction_runs(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  field_name text not null,
  value text,
  normalized_value numeric(18,4),
  unit text,
  year integer,
  period text,
  page_number integer,
  source_text text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  extraction_method extraction_method not null,
  review_status review_status not null default 'unreviewed',
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index extracted_fields_deal_idx on extracted_fields(deal_id, field_name);
create index extracted_fields_low_confidence_idx on extracted_fields(confidence) where confidence < 0.7;

create table discrepancies (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  severity severity not null,
  category discrepancy_category not null,
  title text not null,
  description text not null,
  ai_explanation text,
  suggested_question text,
  document_ids uuid[] not null default '{}',
  conflicting_values jsonb not null default '[]'::jsonb,
  status discrepancy_status not null default 'open',
  -- Stable key per detector, so re-running reconciliation updates in place.
  detector_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, detector_key)
);

create index discrepancies_deal_open_idx on discrepancies(deal_id) where status = 'open';

create table discrepancy_resolutions (
  id uuid primary key default gen_random_uuid(),
  discrepancy_id uuid not null references discrepancies(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  -- Null when the platform closed the finding automatically because the
  -- underlying conflict no longer exists.
  resolved_by uuid references users(id),
  action resolution_action not null,
  resolution_note text not null,
  accepted_value text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Underwriting
-- ---------------------------------------------------------------------------

create table underwriting_runs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  triggered_by uuid references users(id),
  status run_status not null default 'queued',
  provider text not null,
  model text,
  overall_score integer check (overall_score is null or overall_score between 0 and 100),
  confidence numeric(4,3),
  score_components jsonb not null default '[]'::jsonb,
  analysis jsonb,
  -- Fingerprint of the material inputs, used to skip redundant re-analysis.
  input_fingerprint text not null,
  error text,
  duration_ms integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index underwriting_runs_deal_idx on underwriting_runs(deal_id, created_at desc);
create index underwriting_runs_fingerprint_idx on underwriting_runs(deal_id, input_fingerprint);

create table underwriting_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references underwriting_runs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  key text not null,
  label text not null,
  value numeric(18,4),
  unit metric_unit not null,
  -- The formula and inputs are stored so any published figure is reproducible.
  formula text not null,
  inputs jsonb not null default '{}'::jsonb,
  is_derived boolean not null default true,
  created_at timestamptz not null default now()
);

create index underwriting_metrics_run_idx on underwriting_metrics(run_id);

create table underwriting_risks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references underwriting_runs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  severity severity not null,
  category text not null,
  title text not null,
  detail text not null,
  mitigant text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Credit memo
-- ---------------------------------------------------------------------------

create table credit_memos (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade unique,
  current_version integer not null default 0,
  status memo_status not null default 'draft',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table credit_memo_versions (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references credit_memos(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  version integer not null,
  sections jsonb not null,
  generated_by uuid not null references users(id),
  generator memo_generator not null default 'ai',
  underwriting_run_id uuid references underwriting_runs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (memo_id, version)
);

-- ---------------------------------------------------------------------------
-- Lenders
-- ---------------------------------------------------------------------------

create table lenders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade unique,
  institution_name text not null,
  institution_type lender_institution_type not null default 'bank',
  description text,
  logo_initials text not null,
  verification_status lender_verification not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references users(id),
  contact_name text,
  contact_email text,
  contact_phone text,
  public_profile_fields text[] not null default '{}',
  responsiveness_score integer not null default 50 check (responsiveness_score between 0 and 100),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lenders_verified_idx on lenders(verification_status);

create table lender_lending_boxes (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  name text not null default 'Primary lending box',
  active boolean not null default true,
  min_loan numeric(16,2),
  max_loan numeric(16,2),
  max_ltv_pct numeric(9,4),
  min_dscr numeric(9,4),
  min_debt_yield_pct numeric(9,4),
  min_occupancy_pct numeric(9,4),
  states text[] not null default '{}',
  excluded_states text[] not null default '{}',
  asset_types asset_type[] not null default '{}',
  excluded_asset_types asset_type[] not null default '{}',
  transaction_types transaction_type[] not null default '{}',
  min_operator_years integer,
  min_facilities_operated integer,
  max_medicaid_pct numeric(9,4),
  min_private_pay_pct numeric(9,4),
  preferred_deal_size numeric(16,2),
  loan_purposes text[] not null default '{}',
  typical_rate_low_pct numeric(9,4),
  typical_rate_high_pct numeric(9,4),
  typical_term_months integer,
  requires_appraisal boolean not null default true,
  requires_environmental boolean not null default false,
  required_tax_return_years integer not null default 2,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lender_lending_boxes_lender_idx on lender_lending_boxes(lender_id) where active;

create table lender_preferences (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  alerts_enabled boolean not null default true,
  alert_criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Private to the authoring lender. Not visible to borrowers or to admins.
create table lender_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lender_notes_deal_lender_idx on lender_notes(deal_id, lender_id);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  kind saved_search_kind not null default 'lender_marketplace',
  criteria jsonb not null default '{}'::jsonb,
  alert_enabled boolean not null default false,
  last_alert_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Matching and distribution
-- ---------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  lending_box_id uuid not null references lender_lending_boxes(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  band match_band not null,
  hard_fail boolean not null default false,
  factors jsonb not null default '[]'::jsonb,
  ai_explanation text,
  concerns text[] not null default '{}',
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (deal_id, lender_id)
);

create index matches_deal_idx on matches(deal_id) where not hard_fail;
create index matches_lender_idx on matches(lender_id);

create table deal_distributions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  distributed_by uuid not null references users(id),
  scope distribution_scope not null default 'selected_lenders',
  status distribution_status not null default 'sent',
  pipeline_stage pipeline_stage not null default 'new_match',
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  passed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, lender_id)
);

create index deal_distributions_lender_idx on deal_distributions(lender_id);
create index deal_distributions_deal_idx on deal_distributions(deal_id) where status <> 'revoked';

-- ---------------------------------------------------------------------------
-- Indications
-- ---------------------------------------------------------------------------

create table indications (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  submitted_by uuid not null references users(id),
  version integer not null default 1,
  status indication_status not null default 'submitted',
  loan_amount numeric(16,2) not null check (loan_amount > 0),
  rate_type rate_type not null default 'fixed',
  index_name text,
  index_rate_pct numeric(9,4),
  spread_pct numeric(9,4),
  all_in_rate_pct numeric(9,4) not null check (all_in_rate_pct >= 0 and all_in_rate_pct < 100),
  term_months integer not null check (term_months > 0),
  amortization_months integer not null check (amortization_months > 0),
  interest_only_months integer not null default 0 check (interest_only_months >= 0),
  origination_fee_pct numeric(9,4) not null default 0,
  exit_fee_pct numeric(9,4) not null default 0,
  prepayment_terms text,
  recourse recourse_type not null default 'full_recourse',
  guarantees text,
  covenants text,
  closing_timeline_days integer,
  expires_at timestamptz,
  additional_terms text,
  -- False means an indication of interest; true means an actual commitment.
  is_commitment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint indications_io_within_term check (interest_only_months <= term_months),
  constraint indications_amort_not_shorter check (amortization_months >= term_months),
  unique (deal_id, lender_id, version)
);

create index indications_deal_idx on indications(deal_id);
create index indications_lender_idx on indications(lender_id);

create table indication_conditions (
  id uuid primary key default gen_random_uuid(),
  indication_id uuid not null references indications(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  label text not null,
  detail text,
  kind condition_kind not null default 'condition',
  satisfied boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Collaboration
-- ---------------------------------------------------------------------------

create table message_threads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  subject text not null,
  kind thread_kind not null default 'lender_question',
  -- The authoritative participant list; RLS reads it directly.
  participant_company_ids uuid[] not null default '{}',
  lender_id uuid references lenders(id) on delete set null,
  created_by uuid not null references users(id),
  status thread_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index message_threads_deal_idx on message_threads(deal_id);
create index message_threads_participants_idx on message_threads using gin (participant_company_ids);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  author_id uuid not null references users(id),
  author_company_id uuid not null references companies(id),
  body text not null,
  attachments uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index messages_thread_idx on messages(thread_id, created_at);

create table data_requests (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  lender_id uuid references lenders(id) on delete set null,
  requested_by uuid not null references users(id),
  label text not null,
  detail text,
  doc_type document_type not null default 'other',
  source data_request_source not null default 'manual',
  status data_request_status not null default 'open',
  fulfilled_document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index data_requests_deal_idx on data_requests(deal_id) where status = 'open';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  event text not null,
  title text not null,
  body text not null,
  href text,
  severity notification_severity not null default 'info',
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;

-- Append-only: see the RLS policies in 0002_rls.sql.
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  actor_company_id uuid references companies(id) on delete set null,
  deal_id uuid references deals(id) on delete cascade,
  entity_type text not null,
  entity_id text,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index audit_logs_deal_idx on audit_logs(deal_id, created_at desc);
create index audit_logs_company_idx on audit_logs(actor_company_id, created_at desc);
create index audit_logs_action_idx on audit_logs(action, created_at desc);

-- ---------------------------------------------------------------------------
-- Jobs and billing
-- ---------------------------------------------------------------------------

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  deal_id uuid references deals(id) on delete cascade,
  status job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index jobs_status_idx on jobs(status, scheduled_at);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade unique,
  plan_key text not null,
  status subscription_status not null default 'active',
  seats integer not null default 1,
  current_period_end timestamptz,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table billing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  kind billing_event_kind not null,
  amount_usd numeric(14,2) not null default 0,
  description text not null,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index billing_events_company_idx on billing_events(company_id, created_at desc);

-- Append-only: see the RLS policies in 0002_rls.sql.
create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete set null,
  task text not null,
  provider text not null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  duration_ms integer not null default 0,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index ai_usage_events_created_idx on ai_usage_events(created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'users', 'companies', 'deals', 'facilities', 'financial_line_items',
    'transaction_terms', 'sponsors', 'documents', 'discrepancies', 'credit_memos',
    'lenders', 'lender_lending_boxes', 'lender_notes', 'deal_distributions',
    'indications', 'message_threads', 'data_requests', 'subscriptions'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()',
      target, target
    );
  end loop;
end;
$$;
