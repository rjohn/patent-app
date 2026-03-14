import { NextRequest, NextResponse } from 'next/server'

const ODP_BASE = 'https://api.uspto.gov/api/v1/download/applications'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { docId } = await params

  // The full USPTO download URL is passed as ?url=... so we can support
  // both simple and nested URL formats from the API
  const targetUrl = req.nextUrl.searchParams.get('url')
  if (!targetUrl) {
    return new NextResponse('Missing url param', { status: 400 })
  }

  // Validate it's a USPTO download URL so we can't be used as an open proxy
  if (!targetUrl.startsWith('https://api.uspto.gov/')) {
    return new NextResponse('Invalid url', { status: 400 })
  }

  const headers: Record<string, string> = {
    'Accept': 'application/pdf,*/*',
  }
  if (process.env.USPTO_API_KEY) {
    headers['X-Api-Key'] = process.env.USPTO_API_KEY
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(30000),
    })

    if (!upstream.ok) {
      return new NextResponse(`USPTO returned ${upstream.status}`, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf'
    const body = await upstream.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${docId}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e: any) {
    console.error('[doc-download] error:', e?.message)
    return new NextResponse('Failed to fetch document', { status: 502 })
  }
}
