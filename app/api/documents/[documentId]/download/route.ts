import { NextResponse } from 'next/server'
import { getActor, requestIp, requestUserAgent } from '@/lib/auth/session'
import { authorizeDownload } from '@/services/documents'

/**
 * The only route that serves document bytes.
 *
 * Authorization and access logging happen inside `authorizeDownload` before any
 * content is produced, and the response is marked no-store so an authorized
 * document cannot be left in a shared cache.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const actor = await getActor()
  if (!actor) return new NextResponse('Authentication required.', { status: 401 })

  const { documentId } = await params
  const disposition = new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'

  try {
    const grant = await authorizeDownload(
      actor,
      documentId,
      disposition === 'inline' ? 'view' : 'download',
      { ip: await requestIp(), userAgent: await requestUserAgent() },
    )

    // When the storage driver can sign a URL, hand the client straight to it —
    // the authorization check and the access log have already happened.
    if (grant.redirectUrl) return NextResponse.redirect(grant.redirectUrl)

    return new NextResponse(new Uint8Array(grant.bytes), {
      headers: {
        'content-type': grant.document.mime_type || 'application/octet-stream',
        'content-length': String(grant.bytes.length),
        'content-disposition': `${disposition}; filename="${encodeURIComponent(grant.document.filename)}"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to open this document.'
    // A document the actor cannot see is reported the same way as one that does
    // not exist, so the route cannot be used to probe for deals.
    return new NextResponse(message, { status: message.includes('access') ? 403 : 404 })
  }
}
