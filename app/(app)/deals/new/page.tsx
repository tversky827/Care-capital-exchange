import type { Metadata } from 'next'
import { requireActor } from '@/lib/auth/session'
import { DealWizard } from './wizard'

export const metadata: Metadata = { title: 'New deal' }

export default async function NewDealPage() {
  const actor = await requireActor()
  return <DealWizard defaultLegalEntity={actor.company.name} />
}
