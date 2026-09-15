'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, Briefcase, Building2, FileText, FlaskConical, Gauge, GraduationCap,
  Home, LayoutDashboard, ListChecks, Presentation, Search, Settings, ShieldCheck,
  Sparkles, Store, Users, Wallet, Workflow,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Matches nested routes as well as the exact path. */
  prefix?: boolean
  /** Used where the label has to fit under an icon, as on a phone. */
  short?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * The sponsor's navigation when the product is the investment marketplace.
 *
 * Two destinations. A sponsor is here to raise money against properties they
 * operate, so the raise is the only object worth a place in the chrome;
 * everything about a raise lives inside it.
 */
export const SPONSOR_NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/deals', label: 'My raises', icon: Building2, prefix: true },
      { href: '/notifications', label: 'Updates', icon: Activity },
    ],
  },
]

/** The sponsor's navigation when the debt marketplace is also switched on. */
export const BORROWER_NAV: NavGroup[] = [
  {
    label: 'Portfolio',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/deals', label: 'Deals', icon: FileText, prefix: true },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Capital',
    items: [
      { href: '/capital', label: 'Capital markets', icon: Briefcase },
      { href: '/lenders', label: 'Lender directory', icon: Building2, prefix: true },
      { href: '/notifications', label: 'Notifications', icon: Activity },
    ],
  },
]

export const LENDER_NAV: NavGroup[] = [
  {
    label: 'Origination',
    items: [
      { href: '/lender', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/marketplace', label: 'Marketplace', icon: Store, prefix: true },
      { href: '/lender/pipeline', label: 'Pipeline', icon: Workflow },
      { href: '/lender/deals', label: 'My opportunities', icon: FileText, prefix: true },
    ],
  },
  {
    label: 'Institution',
    items: [
      { href: '/lender/box', label: 'Lending box', icon: ListChecks },
      { href: '/lender/profile', label: 'Profile', icon: Building2 },
      { href: '/lender/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/notifications', label: 'Notifications', icon: Activity },
    ],
  },
]

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Marketplace',
    items: [
      { href: '/admin', label: 'Overview', icon: Gauge },
      { href: '/admin/equity', label: 'Raises', icon: Briefcase, prefix: true },
      { href: '/admin/deals', label: 'Properties', icon: FileText },
      { href: '/admin/users', label: 'Users & companies', icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/ai', label: 'AI review', icon: Search },
      { href: '/admin/jobs', label: 'Background jobs', icon: Workflow },
      { href: '/admin/audit', label: 'Audit log', icon: Activity },
      { href: '/admin/billing', label: 'Billing', icon: Wallet },
      { href: '/admin/benchmarks', label: 'Benchmarks', icon: BarChart3 },
      { href: '/admin/sandbox', label: 'Sandbox usage', icon: FlaskConical },
    ],
  },
]

/** Admin navigation with the debt marketplace's own consoles restored. */
export const ADMIN_NAV_WITH_DEBT: NavGroup[] = [
  {
    label: 'Marketplace',
    items: [
      { href: '/admin', label: 'Overview', icon: Gauge },
      { href: '/admin/deals', label: 'Deals', icon: FileText },
      { href: '/admin/lenders', label: 'Lender verification', icon: ShieldCheck },
      { href: '/admin/equity', label: 'Equity marketplace', icon: Briefcase, prefix: true },
      { href: '/admin/users', label: 'Users & companies', icon: Users },
    ],
  },
  ADMIN_NAV[1]!,
]

export const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

/** What an account with no workspace of its own on this deployment is offered. */
export const LOOKER_NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/investments', label: 'Browse investments', icon: Store, prefix: true },
      { href: '/notifications', label: 'Updates', icon: Activity },
    ],
  },
]

/**
 * The investor's navigation.
 *
 * Four. Home is what you are worth, Invest is what you could buy, Portfolio is
 * what you own, Cash is what is spare — and every other question is answered
 * inside one of them.
 *
 * The six this replaced put Distributions and Activity in the chrome as
 * permanent destinations. Both are histories, and a history belongs beside the
 * thing it is a history of: distributions inside the portfolio, activity
 * inside cash. A navigation item earns its slot by being somewhere people go,
 * not by being somewhere that exists.
 */
export const INVESTOR_NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/investor', label: 'Home', icon: Home },
      { href: '/investments', label: 'Invest', icon: Store, prefix: true },
      { href: '/investor/portfolio', label: 'Portfolio', icon: Briefcase, prefix: true },
      { href: '/investor/cash', label: 'Cash', icon: Wallet, prefix: true },
    ],
  },
  {
    label: '',
    items: [
      { href: '/sandbox', label: 'Demo & practice', icon: FlaskConical, prefix: true, short: 'Sandbox' },
    ],
  },
]

/**
 * Navigation inside the sandbox.
 *
 * The same four, pointing at the sandbox's own home, portfolio and cash. The
 * marketplace is shared, because the marketplace itself is — giving practice a
 * separate browse page would be a second implementation of the one screen the
 * whole exercise exists to teach.
 *
 * What-if, Learn and Presentation mode moved out of the primary row and into
 * the overflow: they are worth having and they are not where anybody goes
 * first, and eight items in a row is a menu rather than a navigation.
 */
export const SANDBOX_NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/sandbox/home', label: 'Home', icon: Home },
      { href: '/investments', label: 'Invest', icon: Store, prefix: true },
      { href: '/sandbox/portfolio', label: 'Portfolio', icon: Briefcase, prefix: true },
      { href: '/sandbox/cash', label: 'Cash', icon: Wallet, prefix: true },
    ],
  },
  {
    label: '',
    items: [
      { href: '/sandbox/scenario', label: 'What if?', icon: Sparkles, prefix: true, short: 'What if' },
      { href: '/sandbox/learn', label: 'Learn', icon: GraduationCap, prefix: true },
      { href: '/sandbox/present', label: 'Presentation mode', icon: Presentation, short: 'Present' },
      { href: '/sandbox', label: 'Switch mode', icon: FlaskConical },
    ],
  },
]

export type NavRole = 'borrower' | 'lender' | 'investor' | 'admin'

/**
 * Nav groups are resolved on the client from a role key rather than being
 * passed down from the server layout: the items carry icon components, which
 * are functions and therefore cannot cross the server/client boundary. The
 * server does send the one thing it alone knows — whether this deployment runs
 * the debt marketplace — because a feature flag's environment override is not
 * readable from the browser.
 */
export function navForRole(
  role: NavRole,
  debtMarketplace = false,
  sandbox = false,
): NavGroup[] {
  // Inside the sandbox the chrome is the sandbox's, whatever the account's
  // role. A presenter switching perspectives should not find the navigation
  // pointing back at live surfaces.
  if (sandbox) return SANDBOX_NAV
  if (role === 'admin') return debtMarketplace ? ADMIN_NAV_WITH_DEBT : ADMIN_NAV
  // A lender account on an investment-only deployment has no lender workspace
  // to be offered. It is not locked out — it can read the marketplace like any
  // other signed-in account — but the chrome must not point at pages that are
  // no longer there.
  if (role === 'lender') return debtMarketplace ? LENDER_NAV : LOOKER_NAV
  if (role === 'investor') return INVESTOR_NAV
  return debtMarketplace ? BORROWER_NAV : SPONSOR_NAV
}
