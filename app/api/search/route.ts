import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/session'
import { globalSearch } from '@/services/search'

export async function GET(request: Request) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ results: [] }, { status: 401 })

  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (query.trim().length < 2) return NextResponse.json({ results: [] })

  try {
    const results = await globalSearch(actor, query)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[search] failed', error)
    return NextResponse.json({ results: [], error: 'Search is temporarily unavailable.' }, { status: 500 })
  }
}
