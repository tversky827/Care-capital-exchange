'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, Briefcase, Building2, FileText, Gauge, LayoutDashboard, ListChecks,
  PieChart, Search, Settings, ShieldCheck, Sparkles, Store, Users, Wallet, Workflow,
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
      { href: '/admin/deals', label: 'Deals', icon: FileText },
      { href: '/admin/lenders', label: 'Lender verification', icon: ShieldCheck },
      { href: '/admin/equity', label: 'Equity marketplace', icon: Briefcase, prefix: true },
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

export const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

export const INVESTOR_NAV: NavGroup[] = [
  {
    label: 'Investing',
    items: [
      { href: '/investor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/investments', label: 'Opportunities', icon: Store, prefix: true },
      { href: '/investor/opportunities', label: 'Your matches', icon: Sparkles },
    ],
  },
  {
    label: 'Holdings',
    items: [
      { href: '/investor/portfolio', label: 'Portfolio', icon: Briefcase },
      { href: '/investor/documents', label: 'Documents', icon: FileText },
      { href: '/notifications', label: 'Notifications', icon: Activity },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/investor/profile', label: 'Investor profile', icon: PieChart },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export type NavRole = 'borrower' | 'lender' | 'investor' | 'admin'

/**
 * Nav groups are resolved on the client from a role key rather than being
 * passed down from the server layout: the items carry icon components, which
 * are functions and therefore cannot cross the server/client boundary.
 */
export function navForRole(role: NavRole): NavGroup[] {
  if (role === 'admin') return ADMIN_NAV
  if (role === 'lender') return LENDER_NAV
  if (role === 'investor') return INVESTOR_NAV
  return BORROWER_NAV
}
