import { requireDealAccess } from '@/lib/deal-access'
import { capitalRequirement } from '@/services/equity/capital-stack'
import { PageHeader } from '@/components/ui/primitives'
import { OfferingWizard } from './wizard'

export const dynamic = 'force-dynamic'

export default async function NewOfferingPage({
  params,
}: {
  params: Promise<{ dealId: string }>
}) {
  const { dealId } = await params
  const { deal } = await requireDealAccess(dealId)
  const requirement = await capitalRequirement(dealId)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow={deal.reference}
        title="Create an equity offering"
        description="An offering describes the securities you propose to sell and the terms attached to them. It becomes visible to investors only after review and publication."
      />
      <OfferingWizard
        dealId={dealId}
        suggestedRaise={requirement.equityRequired}
        dealName={deal.name}
      />
    </div>
  )
}
