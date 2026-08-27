import { requireDebtMarketplace } from '@/lib/product'

/** Capital markets across a sponsor's portfolio is a debt-marketplace view. */
export default function DebtSurfaceLayout({ children }: { children: React.ReactNode }) {
  requireDebtMarketplace()
  return children
}
