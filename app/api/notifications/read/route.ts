import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/session'
import { markRead } from '@/services/notifications'

export async function POST(request: Request) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ ok: false }, { status: 401 })

  let notificationId: string | undefined
  try {
    const body = (await request.json()) as { id?: string }
    notificationId = body.id
  } catch {
    // An empty body means "mark everything read".
  }

  await markRead(actor.user.id, notificationId)
  return NextResponse.json({ ok: true })
}
