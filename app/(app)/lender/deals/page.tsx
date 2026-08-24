import { redirect } from 'next/navigation'

/** The opportunity list lives on the lender dashboard. */
export default function LenderDealsIndex() {
  redirect('/lender')
}
