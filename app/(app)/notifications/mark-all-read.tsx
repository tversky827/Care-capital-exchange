'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/primitives'

export function MarkAllRead() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await fetch('/api/notifications/read', { method: 'POST' }).catch(() => undefined)
        router.refresh()
        setPending(false)
      }}
    >
      {pending ? 'Marking…' : 'Mark all read'}
    </Button>
  )
}
