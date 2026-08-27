import { requireDebtMarketplace } from '@/lib/product'

/** The loan marketplace belongs to the debt marketplace. */
export default function DebtSurfaceLayout({ children }: { children: React.ReactNode }) {
  requireDebtMarketplace()
  return children
}
