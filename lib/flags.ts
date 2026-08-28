/**
 * Feature flags.
 *
 * The equity marketplace touches securities regulation, so the capabilities it
 * adds are individually switchable rather than shipped as one block. Legal and
 * compliance decide what is on; engineering decides only that the switch works.
 *
 * Every flag is read from the environment at call time — not captured at module
 * load — so a deployment can change one without a rebuild, and a test can set
 * one for a single case.
 *
 * The defaults are deliberately conservative. Anything that touches an actual
 * securities transaction, real investor verification or money movement is OFF
 * unless a deployment turns it on. Browsing, onboarding and the demo workflow
 * are ON so the product is explorable out of the box.
 */

export const FLAGS = {
  /** The equity marketplace as a whole. Off means the product is debt-only. */
  EQUITY_MARKETPLACE_ENABLED: true,
  /**
   * The debt side: the lender marketplace, lender matching, indications and
   * the lender directory.
   *
   * Off by default. The product this deployment presents is the private
   * healthcare investment marketplace, and the debt engine sits underneath it
   * as underwriting — a raise is still analysed against the debt it carries,
   * and every figure an investor sees still comes from it. What the flag turns
   * off is the debt *marketplace*: the surfaces where a borrower shops a loan
   * to lenders. Turning it back on restores them without a rebuild.
   */
  DEBT_MARKETPLACE_ENABLED: false,
  /** Investors may register and complete onboarding. */
  INVESTOR_ONBOARDING_ENABLED: true,
  /** Investors may record a non-binding commitment against an offering. */
  INVESTMENT_COMMITMENTS_ENABLED: true,
  /**
   * Commitments may be handed to a transaction provider — a broker-dealer,
   * funding portal or custodian. Off means the workflow stops at a recorded
   * commitment and no securities transaction is ever initiated.
   */
  INVESTMENT_TRANSACTIONS_ENABLED: false,
  /** Regulation Crowdfunding offerings may be created. */
  REG_CF_ENABLED: false,
  /** Regulation D 506(b) and 506(c) offerings may be created. */
  REG_D_ENABLED: true,
  /** Accreditation is checked through a verification provider. */
  ACCREDITED_INVESTOR_VERIFICATION_ENABLED: true,
  /** Distribution schedules and statements are visible to investors. */
  DISTRIBUTIONS_ENABLED: true,
  /** Tax document tracking is visible to investors. */
  TAX_DOCUMENTS_ENABLED: true,

  // --- The investor platform ------------------------------------------------
  /** Investor accounts, cash and orders as a whole. */
  INVESTOR_PLATFORM_ENABLED: true,
  /** An investor holds an account with a status and a set of checks. */
  INVESTOR_ACCOUNTS_ENABLED: true,
  /** That account holds cash, funded once and deployed many times. */
  CASH_ACCOUNT_ENABLED: true,
  /** Orders may be placed against an offering from that cash. */
  INVESTMENT_ORDERS_ENABLED: true,
  /** Rules that pre-authorise an allocation. The rules engine only; see below. */
  AUTO_INVEST_ENABLED: false,
  /** The tax centre is visible. */
  TAX_CENTER_ENABLED: true,

  // --- The two that decide whether any of it is real ------------------------
  /**
   * Money actually moves.
   *
   * Off means every deposit, withdrawal and debit is recorded against demo
   * providers and no bank is ever contacted. Turning it on without registering
   * a real payment provider throws rather than silently crediting balances
   * against money that did not move — see `services/accounts/providers`.
   */
  REAL_MONEY_ENABLED: false,
  /**
   * Securities transactions are actually effected.
   *
   * Off means an order settles into a position in this database and nothing
   * else. No security is bought, sold, transferred or registered.
   */
  REAL_SECURITIES_ENABLED: false,
  /** Positions may be transferred between investors. Not built. */
  SECONDARY_MARKET_ENABLED: false,
} as const

export type FeatureFlag = keyof typeof FLAGS

/**
 * Whether a capability is switched on for this deployment.
 *
 * An environment variable of the same name overrides the default: "false",
 * "0" and "off" disable, "true", "1" and "on" enable. Anything else is
 * ignored rather than guessed at, so a typo cannot silently enable a
 * securities capability.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  const raw = process.env[flag]
  if (raw !== undefined) {
    const value = raw.trim().toLowerCase()
    if (['false', '0', 'off', 'no'].includes(value)) return false
    if (['true', '1', 'on', 'yes'].includes(value)) return true
  }
  return FLAGS[flag]
}

/**
 * Flags a nested capability depends on. A commitment is meaningless without the
 * marketplace, so asking for the child implies asking for the parent too.
 */
const REQUIRES: Partial<Record<FeatureFlag, FeatureFlag[]>> = {
  INVESTOR_ACCOUNTS_ENABLED: ['INVESTOR_PLATFORM_ENABLED'],
  CASH_ACCOUNT_ENABLED: ['INVESTOR_PLATFORM_ENABLED', 'INVESTOR_ACCOUNTS_ENABLED'],
  INVESTMENT_ORDERS_ENABLED: [
    'INVESTOR_PLATFORM_ENABLED', 'INVESTOR_ACCOUNTS_ENABLED', 'CASH_ACCOUNT_ENABLED',
    'EQUITY_MARKETPLACE_ENABLED',
  ],
  AUTO_INVEST_ENABLED: ['INVESTMENT_ORDERS_ENABLED'],
  TAX_CENTER_ENABLED: ['INVESTOR_PLATFORM_ENABLED'],
  REAL_MONEY_ENABLED: ['CASH_ACCOUNT_ENABLED'],
  REAL_SECURITIES_ENABLED: ['INVESTMENT_ORDERS_ENABLED'],
  SECONDARY_MARKET_ENABLED: ['REAL_SECURITIES_ENABLED'],
  INVESTOR_ONBOARDING_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
  INVESTMENT_COMMITMENTS_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
  INVESTMENT_TRANSACTIONS_ENABLED: ['EQUITY_MARKETPLACE_ENABLED', 'INVESTMENT_COMMITMENTS_ENABLED'],
  REG_CF_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
  REG_D_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
  DISTRIBUTIONS_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
  TAX_DOCUMENTS_ENABLED: ['EQUITY_MARKETPLACE_ENABLED'],
}

/** Whether a capability and everything it rests on are switched on. */
export function isAvailable(flag: FeatureFlag): boolean {
  if (!isEnabled(flag)) return false
  return (REQUIRES[flag] ?? []).every((required) => isEnabled(required))
}

/** The whole flag set, for the admin console. */
export function flagSnapshot(): { flag: FeatureFlag; enabled: boolean; available: boolean; overridden: boolean }[] {
  return (Object.keys(FLAGS) as FeatureFlag[]).map((flag) => ({
    flag,
    enabled: isEnabled(flag),
    available: isAvailable(flag),
    overridden: process.env[flag] !== undefined,
  }))
}
