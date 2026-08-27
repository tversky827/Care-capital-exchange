import { redirect } from 'next/navigation'
import { requireDebtMarketplace } from '@/lib/product'

/** The opportunity list lives on the lender dashboard. */
export default function LenderDealsIndex() {
  requireDebtMarketplace()
  redirect('/lender')
}
