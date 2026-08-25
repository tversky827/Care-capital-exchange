-- ---------------------------------------------------------------------------
-- CareCapital Exchange — equity marketplace
--
-- Extends the debt schema in 0001_init.sql rather than replacing any of it.
-- An offering belongs to a deal; the facility, financial, document and
-- underwriting records the debt side already holds are the same records the
-- equity side reads.
--
-- Money is numeric, never float. Rates and shares are numeric fractions:
-- 0.0825 is 8.25%. Nothing in this schema stores a computed return — returns
-- are derived by tested application code from the assumptions recorded here.
-- ---------------------------------------------------------------------------

-- The investor role joins the existing company types. These are enums in
-- 0001_init.sql, so the value is added to the type rather than re-checked.
-- Each statement runs in its own transaction: a new enum label cannot be used
-- in the transaction that adds it.
alter type company_type add value if not exists 'investor';
alter type user_role add value if not exists 'investor';

-- ---------------------------------------------------------------------------
-- Investors
-- ---------------------------------------------------------------------------

create table investor_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  display_name text not null,
  investor_type text not null default 'individual'
    check (investor_type in ('individual','family_office','llc','trust','institution','other')),
  state text,
  country text not null default 'US',
  years_investing integer,
  healthcare_experience boolean not null default false,
  prior_private_placements integer,
  -- Self-asserted. Verification lives in investor_verifications and is the
  -- only thing the eligibility engine will accept as proof.
  self_certified_accredited boolean not null default false,
  accreditation_basis text
    check (accreditation_basis is null or accreditation_basis in
      ('income','net_worth','professional_certification','entity_assets','knowledgeable_employee','other')),
  onboarding_stage text not null default 'profile'
    check (onboarding_stage in
      ('profile','experience','preferences','risk','eligibility','kyc','accreditation','agreements','account','complete')),
  onboarding_completed_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investor_profiles_company_idx on investor_profiles(company_id);

create table investor_preferences (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null unique references investor_profiles(id) on delete cascade,
  investment_range text check (investment_range is null or investment_range in
    ('25k_50k','50k_100k','100k_250k','250k_500k','500k_plus')),
  typical_investment numeric(14,2),
  asset_types text[] not null default '{}',
  states text[] not null default '{}',
  min_hold_months integer,
  max_hold_months integer,
  max_leverage_pct numeric(6,4),
  risk_tolerance text check (risk_tolerance is null or risk_tolerance in
    ('conservative','moderate','opportunistic')),
  target_return_min_pct numeric(6,4),
  target_return_max_pct numeric(6,4),
  return_preference text check (return_preference is null or return_preference in
    ('income','appreciation','balanced')),
  capital_positions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The provider's verdict and reference only. The platform never stores the
-- identity documents or financial records used to reach the verdict.
create table investor_verifications (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  kind text not null check (kind in ('identity','kyc','aml','accreditation')),
  status text not null default 'not_verified'
    check (status in ('not_verified','pending','verified','failed','expired')),
  provider text not null,
  provider_reference text,
  detail text,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (investor_id, kind)
);

-- ---------------------------------------------------------------------------
-- Offerings
-- ---------------------------------------------------------------------------

create table offerings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  reference text not null unique,
  offering_type text not null check (offering_type in
    ('private_equity','common_equity','preferred_equity','preferred_return','jv_equity',
     'fund_interest','reg_cf','reg_d_506b','reg_d_506c','other')),
  legal_structure text,
  issuer_entity text,
  summary text,
  target_raise numeric(14,2),
  minimum_investment numeric(14,2),
  maximum_investment numeric(14,2),
  committed_amount numeric(14,2) not null default 0,
  offering_start_date timestamptz,
  offering_end_date timestamptz,
  target_close_date timestamptz,
  status text not null default 'draft' check (status in
    ('draft','under_review','compliance_review','ready','live','paused',
     'fully_subscribed','closed','cancelled')),
  disclosure_status text not null default 'incomplete'
    check (disclosure_status in ('incomplete','drafted','reviewed','published')),
  compliance_status text not null default 'not_started'
    check (compliance_status in ('not_started','in_review','changes_requested','cleared','blocked')),
  published_at timestamptz,
  published_by uuid references users(id),
  closed_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offerings_deal_idx on offerings(deal_id);
create index offerings_company_idx on offerings(company_id);
create index offerings_status_idx on offerings(status);

create table offering_terms (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references offerings(id) on delete cascade,
  capital_position text not null default 'common_equity'
    check (capital_position in ('senior_debt','mezzanine','preferred_equity','common_equity')),
  target_hold_months integer,
  preferred_return_pct numeric(6,4),
  target_irr_pct numeric(6,4),
  target_equity_multiple numeric(6,3),
  target_cash_on_cash_pct numeric(6,4),
  sponsor_promote_pct numeric(6,4),
  distribution_frequency text check (distribution_frequency is null or distribution_frequency in
    ('monthly','quarterly','semiannual','annual','at_exit')),
  acquisition_fee_pct numeric(6,4),
  asset_management_fee_pct numeric(6,4),
  disposition_fee_pct numeric(6,4),
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offering_eligibility (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references offerings(id) on delete cascade,
  accredited_required boolean not null default true,
  verification_required boolean not null default true,
  excluded_states text[] not null default '{}',
  permitted_states text[] not null default '{}',
  entity_types_permitted text[] not null default '{}',
  minimum_net_worth numeric(14,2),
  minimum_income numeric(14,2),
  investment_limit numeric(14,2),
  verification_provider text,
  transaction_provider text,
  broker_dealer text,
  funding_portal text,
  custodian text,
  transfer_agent text,
  required_acknowledgements text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offering_disclosures (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  key text not null,
  title text not null,
  body text not null,
  version integer not null default 1,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, key)
);

-- Publishes an existing deal document into an offering data room at a chosen
-- access level. Never copies bytes: this is a permission record.
create table offering_documents (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  category text not null default 'other',
  access_level text not null default 'verified_investor' check (access_level in
    ('public_teaser','verified_investor','interested_investor','committed_investor',
     'closing_investor','admin_only')),
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, document_id)
);

-- Append-only: a version is the record of what investors were shown.
create table offering_versions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  version integer not null,
  summary text not null,
  material_change boolean not null default false,
  requires_reacknowledgement boolean not null default false,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (offering_id, version)
);

-- Append-only: evidence that a person accepted specific words at a given time.
create table disclosure_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  disclosure_id uuid not null references offering_disclosures(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  user_id uuid not null references users(id),
  disclosure_version integer not null,
  acknowledged_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index disclosure_ack_investor_idx on disclosure_acknowledgements(investor_id, offering_id);

-- ---------------------------------------------------------------------------
-- Interest, commitment, transaction, position
-- ---------------------------------------------------------------------------

create table investment_interests (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  stage text not null default 'interested' check (stage in
    ('interested','eligibility_check','reviewing_documents','application','commitment_pending',
     'commitment_submitted','investment_pending','invested','withdrawn','declined')),
  indicated_amount numeric(14,2),
  notes text,
  first_viewed_at timestamptz,
  expressed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, investor_id)
);
create index investment_interests_investor_idx on investment_interests(investor_id);

create table investment_commitments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  interest_id uuid not null references investment_interests(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'draft' check (status in
    ('draft','submitted','accepted','rejected','cancelled','funded')),
  acknowledged_disclosures uuid[] not null default '{}',
  submitted_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references users(id),
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investment_commitments_offering_idx on investment_commitments(offering_id);
create index investment_commitments_investor_idx on investment_commitments(investor_id);

-- The record of handing a commitment to a party legally permitted to process
-- it. The platform never settles a securities transaction itself.
create table investment_transactions (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references investment_commitments(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  provider text not null,
  provider_reference text,
  status text not null default 'not_started' check (status in
    ('not_started','pending','processing','settled','failed','cancelled')),
  amount numeric(14,2) not null,
  settled_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table investment_positions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  invested_amount numeric(14,2) not null,
  ownership_pct numeric(9,6),
  capital_position text not null default 'common_equity',
  estimated_value numeric(14,2),
  estimated_value_at timestamptz,
  distributions_received numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active','exited','written_off')),
  acquired_at timestamptz not null default now(),
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, investor_id)
);
create index investment_positions_investor_idx on investment_positions(investor_id);

-- ---------------------------------------------------------------------------
-- Waterfall and distributions
-- ---------------------------------------------------------------------------

create table waterfall_structures (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references offerings(id) on delete cascade,
  kind text not null default 'preferred_return_promote' check (kind in
    ('straight_pro_rata','preferred_return','preferred_return_promote','hurdle','multiple_hurdles')),
  cumulative_preferred boolean not null default true,
  has_catch_up boolean not null default false,
  catch_up_pct numeric(6,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table waterfall_tiers (
  id uuid primary key default gen_random_uuid(),
  waterfall_id uuid not null references waterfall_structures(id) on delete cascade,
  sequence integer not null,
  label text not null,
  kind text not null check (kind in ('return_of_capital','preferred_return','catch_up','split')),
  hurdle_irr_pct numeric(6,4),
  hurdle_multiple numeric(6,3),
  lp_share_pct numeric(6,4) not null default 1,
  sponsor_share_pct numeric(6,4) not null default 0,
  created_at timestamptz not null default now(),
  unique (waterfall_id, sequence)
);

create table distribution_events (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  kind text not null default 'operating' check (kind in
    ('operating','special','sale','refinancing','return_of_capital')),
  period_label text not null,
  total_amount numeric(14,2) not null,
  status text not null default 'scheduled' check (status in
    ('scheduled','calculated','approved','processed','failed')),
  scheduled_for timestamptz,
  approved_by uuid references users(id),
  approved_at timestamptz,
  processed_at timestamptz,
  failure_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table investment_distributions (
  id uuid primary key default gen_random_uuid(),
  distribution_event_id uuid not null references distribution_events(id) on delete cascade,
  position_id uuid not null references investment_positions(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  amount numeric(14,2) not null,
  return_of_capital numeric(14,2) not null default 0,
  preferred_return numeric(14,2) not null default 0,
  profit_share numeric(14,2) not null default 0,
  status text not null default 'calculated' check (status in
    ('scheduled','calculated','approved','processed','failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investment_distributions_investor_idx on investment_distributions(investor_id);

-- ---------------------------------------------------------------------------
-- Reporting, questions, risk, scenarios
-- ---------------------------------------------------------------------------

create table investor_updates (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  period_label text not null,
  title text not null,
  body text not null,
  generator text not null default 'ai' check (generator in ('ai','human')),
  status text not null default 'draft' check (status in ('draft','pending_approval','published')),
  metrics jsonb not null default '{}'::jsonb,
  approved_by uuid references users(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tax_documents (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  kind text not null default 'k1' check (kind in ('k1','1099','other')),
  tax_year integer not null,
  status text not null default 'pending' check (status in ('pending','available','amended')),
  available_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table investor_questions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  body text not null,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  status text not null default 'open' check (status in ('open','answered','withdrawn','moderated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table investor_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references investor_questions(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  body text not null,
  answered_by uuid not null references users(id),
  author_role text not null default 'sponsor' check (author_role in ('sponsor','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  overall_score integer not null,
  overall_band text not null check (overall_band in ('low','medium','high')),
  coverage numeric(4,3) not null,
  categories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table investment_scenarios (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  kind text not null check (kind in ('base','upside','downside','severe_downside')),
  label text not null,
  inputs jsonb not null default '{}'::jsonb,
  results jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Capital stack
-- ---------------------------------------------------------------------------

create table capital_stacks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  version integer not null,
  label text not null,
  is_active boolean not null default false,
  total_capitalization numeric(14,2),
  notes text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, version)
);

create table capital_sources (
  id uuid primary key default gen_random_uuid(),
  capital_stack_id uuid not null references capital_stacks(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  position text not null check (position in
    ('senior_debt','mezzanine','preferred_equity','common_equity')),
  label text not null,
  amount numeric(14,2) not null,
  share_pct numeric(6,4),
  cost_pct numeric(6,4),
  lender_id uuid references lenders(id) on delete set null,
  offering_id uuid references offerings(id) on delete set null,
  indication_id uuid references indications(id) on delete set null,
  status text not null default 'planned' check (status in
    ('planned','indicated','committed','funded')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index capital_sources_stack_idx on capital_sources(capital_stack_id);

-- ---------------------------------------------------------------------------
-- Matching, saved items, compliance
-- ---------------------------------------------------------------------------

create table investor_matches (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  score integer not null,
  band text not null check (band in ('strong','possible','outside_preferences')),
  reasons text[] not null default '{}',
  concerns text[] not null default '{}',
  ineligible boolean not null default false,
  ineligible_reason text,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (offering_id, investor_id)
);
create index investor_matches_investor_idx on investor_matches(investor_id, score desc);

create table saved_investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  notify_on_change boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (investor_id, offering_id)
);

create table compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  status text not null default 'not_started' check (status in
    ('not_started','in_review','changes_requested','cleared','blocked')),
  automated_verdict text check (automated_verdict is null or automated_verdict in
    ('pass','warnings','blockers')),
  findings jsonb not null default '[]'::jsonb,
  reviewer_notes text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers, matching 0001's convention
-- ---------------------------------------------------------------------------

create trigger investor_profiles_set_updated_at before update on investor_profiles
  for each row execute function set_updated_at();
create trigger investor_preferences_set_updated_at before update on investor_preferences
  for each row execute function set_updated_at();
create trigger investor_verifications_set_updated_at before update on investor_verifications
  for each row execute function set_updated_at();
create trigger offerings_set_updated_at before update on offerings
  for each row execute function set_updated_at();
create trigger offering_terms_set_updated_at before update on offering_terms
  for each row execute function set_updated_at();
create trigger offering_eligibility_set_updated_at before update on offering_eligibility
  for each row execute function set_updated_at();
create trigger offering_disclosures_set_updated_at before update on offering_disclosures
  for each row execute function set_updated_at();
create trigger offering_documents_set_updated_at before update on offering_documents
  for each row execute function set_updated_at();
create trigger investment_interests_set_updated_at before update on investment_interests
  for each row execute function set_updated_at();
create trigger investment_commitments_set_updated_at before update on investment_commitments
  for each row execute function set_updated_at();
create trigger investment_transactions_set_updated_at before update on investment_transactions
  for each row execute function set_updated_at();
create trigger investment_positions_set_updated_at before update on investment_positions
  for each row execute function set_updated_at();
create trigger waterfall_structures_set_updated_at before update on waterfall_structures
  for each row execute function set_updated_at();
create trigger distribution_events_set_updated_at before update on distribution_events
  for each row execute function set_updated_at();
create trigger investment_distributions_set_updated_at before update on investment_distributions
  for each row execute function set_updated_at();
create trigger investor_updates_set_updated_at before update on investor_updates
  for each row execute function set_updated_at();
create trigger tax_documents_set_updated_at before update on tax_documents
  for each row execute function set_updated_at();
create trigger investor_questions_set_updated_at before update on investor_questions
  for each row execute function set_updated_at();
create trigger investor_answers_set_updated_at before update on investor_answers
  for each row execute function set_updated_at();
create trigger capital_stacks_set_updated_at before update on capital_stacks
  for each row execute function set_updated_at();
create trigger capital_sources_set_updated_at before update on capital_sources
  for each row execute function set_updated_at();
create trigger compliance_reviews_set_updated_at before update on compliance_reviews
  for each row execute function set_updated_at();
