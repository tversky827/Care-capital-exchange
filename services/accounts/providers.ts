import 'server-only'
import { isEnabled } from '@/lib/flags'
import type { Cents } from '@/lib/money'
import type { CheckStatus } from '@/types/accounts'

/**
 * The regulated functions CareCapital does not itself perform.
 *
 * Holding customer cash, verifying identity, screening for money laundering,
 * confirming accreditation, effecting a securities transaction and keeping the
 * register are all activities that require a licence CareCapital does not
 * have and is not assuming it will get. Each is behind an interface here, with
 * a demo implementation that records the same shape of result without doing
 * the regulated thing.
 *
 * This is not a stub to be filled in later and forgotten. It is the boundary
 * that decides what the platform is: everything above these interfaces is
 * software CareCapital can write, and everything below is a contract with a
 * regulated partner. Keeping the line visible in the type system is what stops
 * the second kind quietly becoming the first.
 *
 * Two flags decide whether any of it is real: REAL_MONEY_ENABLED and
 * REAL_SECURITIES_ENABLED. Both are off, and `assertDemo` refuses to hand back
 * a demo provider if either is on without a real one registered — so the
 * failure mode is a loud error rather than a demo provider quietly settling
 * what someone believes is a real transaction.
 */

export interface ProviderResult {
  ok: boolean
  reference: string
  status: string
  detail?: string
}

/** Holds investor cash. A bank or a licensed custodian, never CareCapital. */
export interface CashAccountProvider {
  readonly name: string
  readonly live: boolean
  openAccount(accountId: string, legalName: string): Promise<ProviderResult>
  /** Reports the provider's own balance, for reconciliation against ours. */
  balance(providerRef: string): Promise<Cents | null>
}

/** Moves money in and out. ACH, wire, card. */
export interface PaymentProvider {
  readonly name: string
  readonly live: boolean
  deposit(accountRef: string, amount: Cents, idempotencyKey: string): Promise<ProviderResult>
  withdraw(accountRef: string, amount: Cents, idempotencyKey: string): Promise<ProviderResult>
}

/** Holds the securities themselves. */
export interface CustodyProvider {
  readonly name: string
  readonly live: boolean
  openPosition(accountRef: string, offeringRef: string, amount: Cents): Promise<ProviderResult>
}

/** Effects the transaction. A broker-dealer or a funding portal. */
export interface InvestmentTransactionProvider {
  readonly name: string
  readonly live: boolean
  submitOrder(input: {
    accountRef: string
    offeringRef: string
    amount: Cents
    idempotencyKey: string
  }): Promise<ProviderResult>
  cancelOrder(orderRef: string): Promise<ProviderResult>
}

/** Confirms a person or entity is who they say they are. */
export interface KycProvider {
  readonly name: string
  readonly live: boolean
  verify(accountId: string, legalName: string): Promise<{ status: CheckStatus; reference: string; detail?: string }>
}

/** Screens against sanctions and money-laundering lists. */
export interface AmlProvider {
  readonly name: string
  readonly live: boolean
  screen(accountId: string, legalName: string): Promise<{ status: CheckStatus; reference: string; detail?: string }>
}

/** Confirms accredited-investor status where an offering requires it. */
export interface AccreditationProvider {
  readonly name: string
  readonly live: boolean
  verify(accountId: string, basis: string | null): Promise<{ status: CheckStatus; reference: string; detail?: string }>
}

/** Keeps the register of who owns what. */
export interface TransferAgentProvider {
  readonly name: string
  readonly live: boolean
  record(offeringRef: string, accountRef: string, amount: Cents): Promise<ProviderResult>
}

/** Produces K-1s and 1099s. */
export interface TaxProvider {
  readonly name: string
  readonly live: boolean
  issue(accountRef: string, taxYear: number, form: string): Promise<ProviderResult>
}

// ---------------------------------------------------------------------------
// Demo implementations
// ---------------------------------------------------------------------------

let counter = 0
function ref(prefix: string): string {
  counter += 1
  return `demo_${prefix}_${Date.now().toString(36)}_${counter}`
}

class DemoCashAccountProvider implements CashAccountProvider {
  readonly name = 'demo'
  readonly live = false
  async openAccount(): Promise<ProviderResult> {
    return { ok: true, reference: ref('cash'), status: 'open' }
  }
  /**
   * Returns null rather than a number.
   *
   * A demo provider that reported a balance would be reporting our own figure
   * back to us, and reconciling a number against itself always balances —
   * which is worse than not reconciling at all, because it looks like proof.
   */
  async balance(): Promise<Cents | null> {
    return null
  }
}

class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo'
  readonly live = false
  async deposit(): Promise<ProviderResult> {
    return { ok: true, reference: ref('dep'), status: 'completed' }
  }
  async withdraw(): Promise<ProviderResult> {
    return { ok: true, reference: ref('wd'), status: 'completed' }
  }
}

class DemoCustodyProvider implements CustodyProvider {
  readonly name = 'demo'
  readonly live = false
  async openPosition(): Promise<ProviderResult> {
    return { ok: true, reference: ref('pos'), status: 'open' }
  }
}

class DemoInvestmentTransactionProvider implements InvestmentTransactionProvider {
  readonly name = 'demo'
  readonly live = false
  async submitOrder(): Promise<ProviderResult> {
    return { ok: true, reference: ref('ord'), status: 'accepted' }
  }
  async cancelOrder(): Promise<ProviderResult> {
    return { ok: true, reference: ref('cxl'), status: 'cancelled' }
  }
}

class DemoKycProvider implements KycProvider {
  readonly name = 'demo'
  readonly live = false
  async verify() {
    return { status: 'passed' as CheckStatus, reference: ref('kyc'), detail: 'Demonstration check. No identity was verified.' }
  }
}

class DemoAmlProvider implements AmlProvider {
  readonly name = 'demo'
  readonly live = false
  async screen() {
    return { status: 'passed' as CheckStatus, reference: ref('aml'), detail: 'Demonstration screen. No lists were checked.' }
  }
}

class DemoAccreditationProvider implements AccreditationProvider {
  readonly name = 'demo'
  readonly live = false
  async verify(_accountId: string, basis: string | null) {
    return basis
      ? { status: 'passed' as CheckStatus, reference: ref('acc'), detail: 'Demonstration verification. Nothing was confirmed.' }
      : { status: 'pending' as CheckStatus, reference: ref('acc'), detail: 'State a basis for accreditation to continue.' }
  }
}

class DemoTransferAgentProvider implements TransferAgentProvider {
  readonly name = 'demo'
  readonly live = false
  async record(): Promise<ProviderResult> {
    return { ok: true, reference: ref('ta'), status: 'recorded' }
  }
}

class DemoTaxProvider implements TaxProvider {
  readonly name = 'demo'
  readonly live = false
  async issue(): Promise<ProviderResult> {
    return { ok: true, reference: ref('tax'), status: 'issued' }
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface Registry {
  cashAccount: CashAccountProvider
  payment: PaymentProvider
  custody: CustodyProvider
  investmentTransaction: InvestmentTransactionProvider
  kyc: KycProvider
  aml: AmlProvider
  accreditation: AccreditationProvider
  transferAgent: TransferAgentProvider
  tax: TaxProvider
}

const registry: Registry = {
  cashAccount: new DemoCashAccountProvider(),
  payment: new DemoPaymentProvider(),
  custody: new DemoCustodyProvider(),
  investmentTransaction: new DemoInvestmentTransactionProvider(),
  kyc: new DemoKycProvider(),
  aml: new DemoAmlProvider(),
  accreditation: new DemoAccreditationProvider(),
  transferAgent: new DemoTransferAgentProvider(),
  tax: new DemoTaxProvider(),
}

/** Registers a real provider. Called from deployment configuration, not code. */
export function setProvider<K extends keyof Registry>(kind: K, provider: Registry[K]): void {
  registry[kind] = provider
}

/**
 * The provider for a capability, refusing to hand back a demo one where the
 * deployment claims to be doing the real thing.
 *
 * The failure this prevents is the only one that matters here: a deployment
 * with REAL_MONEY_ENABLED on and no payment provider registered would
 * otherwise use the demo, report every deposit as completed, and credit
 * balances against money that never moved.
 */
export function provider<K extends keyof Registry>(kind: K): Registry[K] {
  const chosen = registry[kind]
  const needsRealMoney = kind === 'cashAccount' || kind === 'payment'
  const needsRealSecurities =
    kind === 'custody' || kind === 'investmentTransaction' || kind === 'transferAgent'

  if (needsRealMoney && isEnabled('REAL_MONEY_ENABLED') && !chosen.live) {
    throw new Error(
      `REAL_MONEY_ENABLED is on but the ${kind} provider is "${chosen.name}", which does not move money. Register a real provider or turn the flag off.`,
    )
  }
  if (needsRealSecurities && isEnabled('REAL_SECURITIES_ENABLED') && !chosen.live) {
    throw new Error(
      `REAL_SECURITIES_ENABLED is on but the ${kind} provider is "${chosen.name}", which does not effect transactions. Register a real provider or turn the flag off.`,
    )
  }
  return chosen
}

/** Whether anything in the money or securities path is real. For the banner. */
export function isDemoMode(): boolean {
  return !isEnabled('REAL_MONEY_ENABLED') && !isEnabled('REAL_SECURITIES_ENABLED')
}

/** What each capability is wired to, for the admin console. */
export function providerSnapshot(): { kind: string; provider: string; live: boolean }[] {
  return (Object.keys(registry) as (keyof Registry)[]).map((kind) => ({
    kind,
    provider: registry[kind].name,
    live: registry[kind].live,
  }))
}
