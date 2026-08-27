import { requireDebtMarketplace } from '@/lib/product'

/** Part of the debt marketplace: hidden when this deployment does not run it. */
export default function DebtSurfaceLayout({ children }: { children: React.ReactNode }) {
  requireDebtMarketplace()
  return children
}
