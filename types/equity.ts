/**
 * CareCapital Exchange — equity marketplace domain model.
 *
 * These types mirror `supabase/migrations/0003_equity.sql` exactly, the same
 * way `types/index.ts` mirrors the debt schema. The equity side sits on top of
 * the existing deal infrastructure rather than beside it: an Offering belongs
 * to a Deal, and the facility, financial, document and underwriting records a
 * lender sees are the same records an investor sees, filtered differently.
 *
 * A note on money and returns. Nothing in this file is a promise. Fields named
 * `target_*` and `projected_*` are assumptions supplied by a sponsor or derived
 * deterministically from them; fields named `actual_*` or `realized_*` are
 * things that happened. The UI must never present the first kind as the second.
 */

import type { AssetType, ISODate, UUID } from './index'

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

export const OFFERING_TYPES = [
  'private_equity', 'common_equity', 'preferred_equity', 'preferred_return',
  'jv_equity', 'fund_interest', 'reg_cf', 'reg_d_506b', 'reg_d_506c', 'other',
] as const
export type OfferingType = (typeof OFFERING_TYPES)[number]

export const OFFERING_STATUSES = [
  'draft', 'under_review', 'compliance_review', 'ready', 'live', 'paused',
  'fully_subscribed', 'closed', 'cancelled',
] as const
export type OfferingStatus = (typeof OFFERING_STATUSES)[number]

/** Whether the offering's disclosure package is complete enough to publish. */
export type DisclosureStatus = 'incomplete' | 'drafted' | 'reviewed' | 'published'

/** Where the offering stands with whoever is responsible for securities compliance. */
export type ComplianceStatus =
  | 'not_started' | 'in_review' | 'changes_requested' | 'cleared' | 'blocked'

/**
 * An offering of securities in a deal.
 *
 * The legal structure is data, not code: nothing here assumes a particular
 * exemption, and the platform never decides that an offering is lawful. It
 * records what the sponsor asserts and what a reviewer has cleared.
 */
export interface Offering {
  /** Which catalogue this raise belongs to. Absent means the live one. */
  environment?: 'live' | 'demo'
  id: UUID
  deal_id: UUID
  company_id: UUID
  name: string
  reference: string
  offering_type: OfferingType
  /** Free text, e.g. "Delaware LLC, manager-managed". Never interpreted. */
  legal_structure: string | null
  issuer_entity: string | null
  summary: string | null
  target_raise: number | null
  minimum_investment: number | null
  maximum_investment: number | null
  /** Raised so far, maintained from accepted commitments — never typed in. */
  committed_amount: number
  offering_start_date: ISODate | null
  offering_end_date: ISODate | null
  target_close_date: ISODate | null
  status: OfferingStatus
  disclosure_status: DisclosureStatus
  compliance_status: ComplianceStatus
  /** Set only when an administrator publishes; the audit trail records who. */
  published_at: ISODate | null
  published_by: UUID | null
  closed_at: ISODate | null
  created_by: UUID
  created_at: ISODate
  updated_at: ISODate
}

/**
 * The economics of an offering, kept separate from its identity because terms
 * are versioned and re-acknowledged when they change materially.
 */
export interface OfferingTerms {
  id: UUID
  offering_id: UUID
  /** Position in the capital stack this offering sells. */
  capital_position: CapitalPosition
  target_hold_months: number | null
  /** Annual preferred return rate, as a fraction. 0.08 is 8%. */
  preferred_return_pct: number | null
  target_irr_pct: number | null
  target_equity_multiple: number | null
  target_cash_on_cash_pct: number | null
  /** Sponsor's share above the hurdle, as a fraction. */
  sponsor_promote_pct: number | null
  distribution_frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'at_exit' | null
  /** Fees charged to investors, as fractions of the relevant base. */
  acquisition_fee_pct: number | null
  asset_management_fee_pct: number | null
  disposition_fee_pct: number | null
  /** The assumptions every projection on the offering is computed from. */
  assumptions: OfferingAssumptions
  created_at: ISODate
  updated_at: ISODate
}

/**
 * Inputs to the deterministic projection engine.
 *
 * Every one of these is a stated assumption. The engine refuses to produce a
 * projection when a required assumption is absent rather than choosing one.
 */
export interface OfferingAssumptions {
  hold_years: number | null
  exit_cap_rate_pct: number | null
  exit_multiple_of_ebitda: number | null
  revenue_growth_pct: number | null
  expense_growth_pct: number | null
  occupancy_stabilized_pct: number | null
  /** Annual capital expenditure reserve per bed. */
  capex_per_bed: number | null
  selling_costs_pct: number | null
  notes: string | null
}

export const CAPITAL_POSITIONS = [
  'senior_debt', 'mezzanine', 'preferred_equity', 'common_equity',
] as const
export type CapitalPosition = (typeof CAPITAL_POSITIONS)[number]

/**
 * Who may invest in an offering. Evaluated by the eligibility engine, which is
 * the only thing permitted to decide whether an investor may proceed.
 */
export interface OfferingEligibility {
  id: UUID
  offering_id: UUID
  accredited_required: boolean
  verification_required: boolean
  /** Two-letter state codes an investor must not reside in. Empty means none. */
  excluded_states: string[]
  /** Two-letter state codes the offering is limited to. Empty means unrestricted. */
  permitted_states: string[]
  entity_types_permitted: InvestorType[]
  minimum_net_worth: number | null
  minimum_income: number | null
  /** Per-investor ceiling under the offering's exemption, when one applies. */
  investment_limit: number | null
  /** Service identifiers, never credentials. */
  verification_provider: string | null
  transaction_provider: string | null
  broker_dealer: string | null
  funding_portal: string | null
  custodian: string | null
  transfer_agent: string | null
  required_acknowledgements: string[]
  created_at: ISODate
  updated_at: ISODate
}

/** A disclosure an investor must read and acknowledge before proceeding. */
export interface OfferingDisclosure {
  id: UUID
  offering_id: UUID
  key: string
  title: string
  body: string
  /** Bumped whenever the text changes materially; drives re-acknowledgement. */
  version: number
  required: boolean
  created_at: ISODate
  updated_at: ISODate
}

/** Records that a specific investor accepted a specific version of a disclosure. */
export interface DisclosureAcknowledgement {
  id: UUID
  offering_id: UUID
  disclosure_id: UUID
  investor_id: UUID
  user_id: UUID
  disclosure_version: number
  acknowledged_at: ISODate
  /** Coarse request metadata, retained because acknowledgement is evidentiary. */
  ip_address: string | null
  user_agent: string | null
  created_at: ISODate
}

/**
 * A signed confidentiality agreement between a viewer and one offering.
 *
 * Recorded per offering rather than once per account: an operator's consent to
 * disclose is given about their own raise, and a person who agreed to keep one
 * facility's figures confidential has not agreed anything about another's.
 *
 * Append-only, and stores the exact text version accepted rather than a
 * pointer to "the current NDA" — the only question this record ever has to
 * answer is what a specific person agreed to on a specific day, and a pointer
 * to text that has since changed cannot answer it.
 */
export interface NdaAcceptance {
  id: UUID
  offering_id: UUID
  company_id: UUID
  user_id: UUID
  /** Null where the viewer's company has no investor profile. */
  investor_id: UUID | null
  /** Identifier of the agreement text, e.g. "mutual-nda-v1". */
  nda_version: string
  /** The name the person typed as their signature. */
  signed_name: string
  accepted_at: ISODate
  /** Coarse request metadata, retained because acceptance is evidentiary. */
  ip_address: string | null
  user_agent: string | null
  created_at: ISODate
}

/** Access tiers for offering material. Ordered from least to most privileged. */
export const OFFERING_ACCESS_LEVELS = [
  'public_teaser', 'verified_investor', 'interested_investor',
  'committed_investor', 'closing_investor', 'admin_only',
] as const
export type OfferingAccessLevel = (typeof OFFERING_ACCESS_LEVELS)[number]

/**
 * Publishes an existing deal document into an offering's data room at a chosen
 * access level. The bytes are never copied — this is a permission record.
 */
export interface OfferingDocument {
  id: UUID
  offering_id: UUID
  document_id: UUID
  category: OfferingDocumentCategory
  access_level: OfferingAccessLevel
  display_name: string
  sort_order: number
  created_at: ISODate
  updated_at: ISODate
}

export const OFFERING_DOCUMENT_CATEGORIES = [
  'offering_memorandum', 'private_placement_memorandum', 'financial_statements',
  'risk_factors', 'subscription_agreement', 'operating_agreement', 'investor_agreement',
  'purchase_agreement', 'appraisal', 'debt_documents', 'tax_documents',
  'quarterly_report', 'annual_report', 'distribution_statement', 'other',
] as const
export type OfferingDocumentCategory = (typeof OFFERING_DOCUMENT_CATEGORIES)[number]

/**
 * A frozen snapshot of an offering's material terms.
 *
 * Terms are never edited in place once investors have seen them: a change
 * writes a new version, and investors who acknowledged the old one are asked
 * again where the offering's configuration requires it.
 */
export interface OfferingVersion {
  id: UUID
  offering_id: UUID
  version: number
  /** What changed and why, written by whoever changed it. */
  summary: string
  material_change: boolean
  requires_reacknowledgement: boolean
  snapshot: Record<string, unknown>
  created_by: UUID
  created_at: ISODate
}

// ---------------------------------------------------------------------------
// Investors
// ---------------------------------------------------------------------------

export const INVESTOR_TYPES = [
  'individual', 'family_office', 'llc', 'trust', 'institution', 'other',
] as const
export type InvestorType = (typeof INVESTOR_TYPES)[number]

export const INVESTMENT_RANGES = [
  '25k_50k', '50k_100k', '100k_250k', '250k_500k', '500k_plus',
] as const
export type InvestmentRange = (typeof INVESTMENT_RANGES)[number]

export type RiskTolerance = 'conservative' | 'moderate' | 'opportunistic'
export type ReturnPreference = 'income' | 'appreciation' | 'balanced'

/** The stage an investor has reached in onboarding. */
export type OnboardingStage =
  | 'profile' | 'experience' | 'preferences' | 'risk' | 'eligibility'
  | 'kyc' | 'accreditation' | 'agreements' | 'account' | 'complete'

/**
 * An investing organisation or individual.
 *
 * Mirrors the shape of `Lender`: the company record carries identity and
 * membership, and this record carries what the marketplace needs to know.
 */
export interface InvestorProfile {
  id: UUID
  company_id: UUID
  display_name: string
  investor_type: InvestorType
  /** Jurisdiction of residence or formation, used for offering eligibility. */
  state: string | null
  country: string
  years_investing: number | null
  healthcare_experience: boolean
  prior_private_placements: number | null
  /** Self-asserted, never treated as verified. Verification is separate. */
  self_certified_accredited: boolean
  accreditation_basis: AccreditationBasis | null
  onboarding_stage: OnboardingStage
  onboarding_completed_at: ISODate | null
  status: 'active' | 'suspended' | 'closed'
  created_at: ISODate
  updated_at: ISODate
}

export type AccreditationBasis =
  | 'income' | 'net_worth' | 'professional_certification'
  | 'entity_assets' | 'knowledgeable_employee' | 'other'

/** What an investor is looking for. Drives the deterministic matching engine. */
export interface InvestorPreferences {
  id: UUID
  investor_id: UUID
  investment_range: InvestmentRange | null
  typical_investment: number | null
  asset_types: AssetType[]
  /** Two-letter state codes. Empty means no geographic preference. */
  states: string[]
  min_hold_months: number | null
  max_hold_months: number | null
  /** Maximum leverage tolerated, as a fraction of total capitalisation. */
  max_leverage_pct: number | null
  risk_tolerance: RiskTolerance | null
  target_return_min_pct: number | null
  target_return_max_pct: number | null
  return_preference: ReturnPreference | null
  capital_positions: CapitalPosition[]
  created_at: ISODate
  updated_at: ISODate
}

export const VERIFICATION_STATUSES = [
  'not_verified', 'pending', 'verified', 'failed', 'expired',
] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export type VerificationKind = 'identity' | 'kyc' | 'aml' | 'accreditation'

/**
 * The outcome of a check performed by an external provider.
 *
 * The platform stores the provider's verdict and reference, never the
 * underlying documents or identifiers used to reach it.
 */
export interface InvestorVerification {
  id: UUID
  investor_id: UUID
  kind: VerificationKind
  status: VerificationStatus
  provider: string
  /** The provider's own identifier for this check, for support and audit. */
  provider_reference: string | null
  /** Why a check failed, in the provider's words. Never invented here. */
  detail: string | null
  verified_at: ISODate | null
  expires_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

// ---------------------------------------------------------------------------
// Interest, commitment, transaction
// ---------------------------------------------------------------------------

export const INVESTMENT_STAGES = [
  'interested', 'eligibility_check', 'reviewing_documents', 'application',
  'commitment_pending', 'commitment_submitted', 'investment_pending',
  'invested', 'withdrawn', 'declined',
] as const
export type InvestmentStage = (typeof INVESTMENT_STAGES)[number]

/**
 * An investor's engagement with an offering, from first interest to funded.
 *
 * One row per investor per offering. The stage advances only through the
 * service layer, which re-checks eligibility at every transition.
 */
export interface InvestmentInterest {
  id: UUID
  offering_id: UUID
  investor_id: UUID
  deal_id: UUID
  stage: InvestmentStage
  /** What the investor says they might invest. Not a commitment. */
  indicated_amount: number | null
  notes: string | null
  first_viewed_at: ISODate | null
  expressed_at: ISODate | null
  withdrawn_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type CommitmentStatus =
  | 'draft' | 'submitted' | 'accepted' | 'rejected' | 'cancelled' | 'funded'

/**
 * A stated intention to invest a specific amount.
 *
 * This is not a securities transaction. It becomes one only when a transaction
 * provider is configured and INVESTMENT_TRANSACTIONS_ENABLED is on; until then
 * the workflow stops here and the record says so.
 */
export interface InvestmentCommitment {
  id: UUID
  offering_id: UUID
  investor_id: UUID
  interest_id: UUID
  amount: number
  status: CommitmentStatus
  /** Every disclosure the offering required, acknowledged before submission. */
  acknowledged_disclosures: UUID[]
  submitted_at: ISODate | null
  accepted_at: ISODate | null
  accepted_by: UUID | null
  rejected_reason: string | null
  created_at: ISODate
  updated_at: ISODate
}

export type TransactionStatus =
  | 'not_started' | 'pending' | 'processing' | 'settled' | 'failed' | 'cancelled'

/**
 * The record of handing a commitment to whoever is legally permitted to
 * process it. The platform never settles a securities transaction itself.
 */
export interface InvestmentTransaction {
  id: UUID
  commitment_id: UUID
  offering_id: UUID
  investor_id: UUID
  provider: string
  provider_reference: string | null
  status: TransactionStatus
  amount: number
  /** Set only by the provider adapter, never by application code. */
  settled_at: ISODate | null
  failure_reason: string | null
  created_at: ISODate
  updated_at: ISODate
}

/** An investor's realised holding in an offering, created when funding settles. */
export interface InvestmentPosition {
  id: UUID
  offering_id: UUID
  investor_id: UUID
  deal_id: UUID
  /** Capital actually contributed. */
  invested_amount: number
  /** Share of the offering's equity class, as a fraction. */
  ownership_pct: number | null
  capital_position: CapitalPosition
  /** Sponsor's current estimate. Explicitly an estimate everywhere it appears. */
  estimated_value: number | null
  estimated_value_at: ISODate | null
  /** Sum of processed distributions. Maintained from distribution records. */
  distributions_received: number
  status: 'active' | 'exited' | 'written_off'
  acquired_at: ISODate
  exited_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

// ---------------------------------------------------------------------------
// Waterfall and distributions
// ---------------------------------------------------------------------------

export type WaterfallKind =
  | 'straight_pro_rata' | 'preferred_return' | 'preferred_return_promote'
  | 'hurdle' | 'multiple_hurdles'

export interface WaterfallStructure {
  id: UUID
  offering_id: UUID
  kind: WaterfallKind
  /** Whether unpaid preferred return accrues to later periods. */
  cumulative_preferred: boolean
  /** Whether the sponsor catches up to its promote after the hurdle clears. */
  has_catch_up: boolean
  catch_up_pct: number | null
  created_at: ISODate
  updated_at: ISODate
}

/**
 * One tier of a distribution waterfall, applied in `sequence` order.
 *
 * `hurdle_irr_pct` and `hurdle_multiple` are thresholds the limited partners
 * must reach before the tier's split applies.
 */
export interface WaterfallTier {
  id: UUID
  waterfall_id: UUID
  sequence: number
  label: string
  kind: 'return_of_capital' | 'preferred_return' | 'catch_up' | 'split'
  hurdle_irr_pct: number | null
  hurdle_multiple: number | null
  /** Share to limited partners in this tier, as a fraction. */
  lp_share_pct: number
  sponsor_share_pct: number
  created_at: ISODate
}

export type DistributionStatus =
  | 'scheduled' | 'calculated' | 'approved' | 'processed' | 'failed'

export type DistributionKind =
  | 'operating' | 'special' | 'sale' | 'refinancing' | 'return_of_capital'

/** A distribution event at the offering level, before investor allocation. */
export interface DistributionEvent {
  id: UUID
  offering_id: UUID
  deal_id: UUID
  kind: DistributionKind
  period_label: string
  /** Total cash available to the equity class for this event. */
  total_amount: number
  status: DistributionStatus
  scheduled_for: ISODate | null
  approved_by: UUID | null
  approved_at: ISODate | null
  processed_at: ISODate | null
  failure_reason: string | null
  notes: string | null
  created_at: ISODate
  updated_at: ISODate
}

/** One investor's share of a distribution event, computed by the waterfall. */
export interface InvestmentDistribution {
  id: UUID
  distribution_event_id: UUID
  position_id: UUID
  investor_id: UUID
  offering_id: UUID
  amount: number
  /** How the amount splits, so a statement can explain itself. */
  return_of_capital: number
  preferred_return: number
  profit_share: number
  status: DistributionStatus
  processed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

// ---------------------------------------------------------------------------
// Reporting, questions, risk
// ---------------------------------------------------------------------------

export interface InvestorUpdate {
  id: UUID
  offering_id: UUID
  deal_id: UUID
  period_label: string
  title: string
  /** Drafted by the analyst, published only after a human approves. */
  body: string
  generator: 'ai' | 'human'
  status: 'draft' | 'pending_approval' | 'published'
  /** Reported operating figures for the period, all actuals. */
  metrics: InvestorUpdateMetrics
  approved_by: UUID | null
  approved_at: ISODate | null
  published_at: ISODate | null
  created_by: UUID
  created_at: ISODate
  updated_at: ISODate
}

export interface InvestorUpdateMetrics {
  revenue: number | null
  ebitda: number | null
  occupancy_pct: number | null
  agency_labor_pct: number | null
  debt_balance: number | null
  capex: number | null
  distribution_per_100k: number | null
}

export type TaxDocumentKind = 'k1' | '1099' | 'other'

export interface TaxDocument {
  id: UUID
  investor_id: UUID
  offering_id: UUID
  document_id: UUID | null
  kind: TaxDocumentKind
  tax_year: number
  status: 'pending' | 'available' | 'amended'
  available_at: ISODate | null
  viewed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

/** A question from an investor about an offering. */
export interface InvestorQuestion {
  id: UUID
  offering_id: UUID
  investor_id: UUID
  body: string
  /** Whether other investors may see the question and its answer. */
  visibility: 'private' | 'shared'
  status: 'open' | 'answered' | 'withdrawn' | 'moderated'
  created_at: ISODate
  updated_at: ISODate
}

export interface InvestorAnswer {
  id: UUID
  question_id: UUID
  offering_id: UUID
  body: string
  answered_by: UUID
  /** Sponsor answers are attributed; the platform never answers as the sponsor. */
  author_role: 'sponsor' | 'admin'
  created_at: ISODate
  updated_at: ISODate
}

export const RISK_CATEGORIES = [
  'financial', 'operational', 'leverage', 'market', 'regulatory',
  'sponsor', 'liquidity', 'exit',
] as const
export type RiskCategory = (typeof RISK_CATEGORIES)[number]

export type RiskBand = 'low' | 'medium' | 'high'

/**
 * A deterministic risk assessment of an offering.
 *
 * The score is computed from the deal's own figures by tested code. It is a
 * summary of stated characteristics, not a judgement about outcomes, and the
 * UI is required to show how it was reached.
 */
export interface RiskAssessment {
  id: UUID
  offering_id: UUID
  deal_id: UUID
  overall_score: number
  overall_band: RiskBand
  /** Share of the expected inputs that were actually available, 0 to 1. */
  coverage: number
  categories: RiskCategoryScore[]
  created_at: ISODate
}

export interface RiskCategoryScore {
  category: RiskCategory
  score: number
  band: RiskBand
  /** Why the score is what it is, in terms of the figures behind it. */
  rationale: string
  /** Null when the deal does not carry the data this category needs. */
  available: boolean
}

export type ScenarioKind = 'base' | 'upside' | 'downside' | 'severe_downside'

/** A stored what-if, with its inputs so the result can be reproduced. */
export interface InvestmentScenario {
  id: UUID
  offering_id: UUID
  deal_id: UUID
  kind: ScenarioKind
  label: string
  inputs: ScenarioInputs
  results: ScenarioResults | null
  created_by: UUID | null
  created_at: ISODate
}

export interface ScenarioInputs {
  occupancy_delta_pct: number
  revenue_delta_pct: number
  labor_delta_pct: number
  interest_rate_delta_pct: number
  capex_event: number
  exit_multiple_delta: number
  hold_years_delta: number
}

export interface ScenarioResults {
  noi: number | null
  debt_service: number | null
  dscr: number | null
  cash_flow_to_equity: number | null
  equity_value: number | null
  investor_distributions: number | null
  irr_pct: number | null
  equity_multiple: number | null
  /** Set when a required input was missing; the UI shows this instead of numbers. */
  insufficient_data: string | null
}

// ---------------------------------------------------------------------------
// Capital stack
// ---------------------------------------------------------------------------

/**
 * A capital structure for a deal. Versioned, because comparing structures is
 * the point — a sponsor keeps several and chooses between them.
 */
export interface CapitalStack {
  id: UUID
  deal_id: UUID
  version: number
  label: string
  /** The structure the deal is actually pursuing. Exactly one per deal. */
  is_active: boolean
  total_capitalization: number | null
  notes: string | null
  created_by: UUID
  created_at: ISODate
  updated_at: ISODate
}

/** One layer of a capital stack. */
export interface CapitalSource {
  id: UUID
  capital_stack_id: UUID
  deal_id: UUID
  position: CapitalPosition
  label: string
  amount: number
  /** Share of total capitalisation, as a fraction. Derived, never typed in. */
  share_pct: number | null
  /** Annual cost of this layer, as a fraction: interest, preferred rate, or null. */
  cost_pct: number | null
  /** Links the layer to whoever is providing it, when that is known. */
  lender_id: UUID | null
  offering_id: UUID | null
  indication_id: UUID | null
  status: 'planned' | 'indicated' | 'committed' | 'funded'
  sort_order: number
  created_at: ISODate
  updated_at: ISODate
}

// ---------------------------------------------------------------------------
// Matching, saved items, compliance
// ---------------------------------------------------------------------------

/**
 * A deterministic fit between an investor and an offering.
 *
 * Deliberately shaped like the lender `Match`: a score, the factors behind it,
 * and the concerns that pulled it down. It is never described as a
 * recommendation, and never as advice.
 */
export interface InvestorMatch {
  id: UUID
  offering_id: UUID
  investor_id: UUID
  deal_id: UUID
  score: number
  band: 'strong' | 'possible' | 'outside_preferences'
  reasons: string[]
  concerns: string[]
  /** True when the investor cannot invest at all, whatever the fit. */
  ineligible: boolean
  ineligible_reason: string | null
  computed_at: ISODate
  created_at: ISODate
}

export interface SavedInvestment {
  id: UUID
  investor_id: UUID
  offering_id: UUID
  notify_on_change: boolean
  notes: string | null
  created_at: ISODate
}

/** A reviewer's pass over an offering before it may be published. */
export interface ComplianceReview {
  id: UUID
  offering_id: UUID
  status: ComplianceStatus
  /** The automated quality check's verdict at the time of review. */
  automated_verdict: 'pass' | 'warnings' | 'blockers' | null
  findings: ComplianceFinding[]
  reviewer_notes: string | null
  reviewed_by: UUID | null
  reviewed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface ComplianceFinding {
  severity: 'blocker' | 'warning' | 'note'
  code: string
  title: string
  detail: string
}
