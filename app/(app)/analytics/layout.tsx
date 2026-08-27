import { requireDebtMarketplace } from '@/lib/product'

/** Portfolio analytics reports on debt raised, so it follows the debt marketplace. */
export default function DebtSurfaceLayout({ children }: { children: React.ReactNode }) {
  requireDebtMarketplace()
  return children
}
