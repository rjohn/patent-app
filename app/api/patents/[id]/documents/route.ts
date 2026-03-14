import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

// Normalizes a raw document entry from the USPTO /documents endpoint
function normalizeRaw(d: any) {
  const pdfOption = d.downloadOptionBag?.find((o: any) => o.mimeTypeIdentifier === 'PDF')
  const anyOption = d.downloadOptionBag?.[0]
  const chosen    = pdfOption || anyOption
  return {
    documentIdentifier:          d.documentIdentifier          || null,
    documentCode:                d.documentCode                || '',
    documentCodeDescriptionText: d.documentCodeDescriptionText || '',
    officialDate:                d.officialDate                || null,
    directionCategory:           d.directionCategory           || '',
    pageCount:                   chosen?.pageTotalQuantity     || null,
    downloadUrl:                 chosen?.downloadUrl           || null,
    mimeType:                    chosen?.mimeTypeIdentifier    || null,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, rawJsonData: true, jurisdiction: true },
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const jur = (patent.jurisdiction || '').toUpperCase()
    if (jur === 'EP') {
      return NextResponse.json({ documents: [], total: 0, source: 'none', debug: 'EP patent' })
    }

    // Try stored documentBag first.
    // Already normalized by fetchDocuments() — no downloadOptionBag present.
    const stored = patent.rawJsonData as any
    const storedBag = stored?.documentBag
    if (Array.isArray(storedBag) && storedBag.length > 0) {
      const documents = [...storedBag]
        .filter((d: any) => d.officialDate)
        .sort((a: any, b: any) => b.officialDate.localeCompare(a.officialDate))
      return NextResponse.json({ documents, total: documents.length, source: 'stored' })
    }

    // No stored data — fall back to live fetch
    if (!patent.applicationNumber) {
      return NextResponse.json({ documents: [], total: 0, source: 'none', debug: 'no applicationNumber' })
    }

    // Strip any formatting: slashes, commas, spaces
    const appNum = patent.applicationNumber.replace(/[/,\s]/g, '')
    console.log('[documents] live fetch for appNum:', appNum)

    let res: Response
    try {
      res = await fetch(`${ODP_BASE}/${appNum}/documents`, {
        headers: odpHeaders(),
        signal: AbortSignal.timeout(12000),
      })
    } catch (fetchErr: any) {
      console.error('[documents] fetch threw:', fetchErr?.message)
      return NextResponse.json({ documents: [], total: 0, source: 'live', debug: `fetch error: ${fetchErr?.message}` })
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[documents] USPTO returned', res.status, body.slice(0, 200))
      return NextResponse.json({ documents: [], total: 0, source: 'live', debug: `USPTO ${res.status}: ${body.slice(0, 100)}` })
    }

    const data = await res.json()
    const bag: any[] = data?.documentBag || []
    console.log('[documents] live bag length:', bag.length)

    const documents = bag
      .filter((d: any) => d.officialDate)
      .sort((a: any, b: any) => b.officialDate.localeCompare(a.officialDate))
      .map(normalizeRaw)

    return NextResponse.json({ documents, total: documents.length, source: 'live' })
  } catch (e: any) {
    console.error('[documents] route error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
