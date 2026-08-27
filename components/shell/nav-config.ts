'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, Briefcase, Building2, FileText, Gauge, LayoutDashboard, ListChecks,
  Search, Settings, ShieldCheck, Store, Users, Wallet, Workflow,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Matches nested routes as well as the exact path. */
  prefix?: boolean
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

/**
 * The investor's navigation.
 *
 * Three destinations: what you could buy, what you already own, what changed.
 * Saved offerings, matches, documents and the accreditation profile are all
 * reachable from inside those three, and none of them earns a permanent slot.
 */
export const INVESTOR_NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/investments', label: 'Browse investments', icon: Store, prefix: true },
      { href: '/investor/portfolio', label: 'My portfolio', icon: Briefcase, prefix: true },
      { href: '/notifications', label: 'Updates', icon: Activity },
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
export function navForRole(role: NavRole, debtMarketplace = false): NavGroup[] {
  if (role === 'admin') return debtMarketplace ? ADMIN_NAV_WITH_DEBT : ADMIN_NAV
  if (role === 'lender') return LENDER_NAV
  if (role === 'investor') return INVESTOR_NAV
  return debtMarketplace ? BORROWER_NAV : SPONSOR_NAV
}
