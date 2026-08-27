import { requireDebtMarketplace } from '@/lib/product'

/** The lender's own workspace belongs to the debt marketplace. */
export default function DebtSurfaceLayout({ children }: { children: React.ReactNode }) {
  requireDebtMarketplace()
  return children
}
