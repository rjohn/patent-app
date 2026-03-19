import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

function mapStatus(s: string): string {
  const l = (s || '').toLowerCase()
  if (l.includes('patented') || l.includes('grant') || l.includes('issued')) return 'GRANTED'
  if (l.includes('abandon'))  return 'ABANDONED'
  if (l.includes('expired'))  return 'EXPIRED'
  if (l.includes('publish'))  return 'PUBLISHED'
  return 'PENDING'
}

async function fetchPatentData(appNumber: string | null, patentNumber: string | null) {
  try {
    let q: string
    if (appNumber) {
      q = `applicationNumberText:${appNumber.replace(/\D/g, '')}`
    } else if (patentNumber) {
      q = `applicationMetaData.patentNumber:${patentNumber.replace(/\D/g, '')}`
    } else {
      return null
    }

    const url = new URL(`${ODP_BASE}/search`)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '1')

    const res = await fetch(url.toString(), {
      headers: odpHeaders(),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const record = data?.patentFileWrapperDataBag?.[0]
    if (!record) return null

    const meta = record.applicationMetaData || {}

    const inventors = (meta.inventorBag || [])
      .map((inv: any) => inv.inventorNameText || `${inv.inventorFirstNameText || ''} ${inv.inventorLastNameText || ''}`.trim())
      .filter(Boolean) as string[]

    const assignee = meta.applicantBag?.[0]?.applicantNameText || meta.firstApplicantName || null

    const cpcCodes = (meta.cpcClassificationBag || [])
      .map((c: any) => (typeof c === 'string' ? c : c?.cpcClassificationText || ''))
      .filter(Boolean) as string[]

    const abstract: string | null = meta.abstractText || meta.inventionAbstractText || null

    let expirationDate: string | null = null
    if (meta.filingDate) {
      const d = new Date(meta.filingDate)
      d.setFullYear(d.getFullYear() + 20)
      expirationDate = d.toISOString().split('T')[0]
    }

    return {
      title:          meta.inventionTitle || meta.patentTitle || null,
      assignee,
      inventors,
      filingDate:     meta.filingDate || null,
      grantDate:      meta.grantDate || meta.patentGrantDate || null,
      expirationDate,
      status:         mapStatus(meta.applicationStatusDescriptionText || ''),
      abstract,
      cpcCodes,
      patentNumber:   meta.patentNumber || null,
      appNumber:      record.applicationNumberText || null,
    }
  } catch {
    return null
  }
}

// POST /api/watchlists/[id]/patents/refresh
// Body: {} to refresh all entries missing abstracts, or { entryId } for one
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: watchlistId } = await params
  const body = await req.json().catch(() => ({}))
  const { entryId } = body

  const watchlist = await prisma.watchlist.findUnique({
    where: { id: watchlistId },
    include: { entries: true },
  })
  if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const targets = entryId
    ? watchlist.entries.filter(e => e.id === entryId)
    : watchlist.entries.filter(e => !e.abstract)   // only those missing abstracts

  if (targets.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'All entries already have abstracts' })
  }

  let refreshed = 0
  let failed = 0

  for (const entry of targets) {
    const data = await fetchPatentData(entry.appNumber, entry.patentNumber)
    if (!data) { failed++; continue }

    await prisma.watchlistEntry.update({
      where: { id: entry.id },
      data: {
        ...(data.title        && { title: data.title }),
        ...(data.assignee     && { assignee: data.assignee }),
        ...(data.inventors.length && { inventors: data.inventors }),
        ...(data.filingDate   && { filingDate: data.filingDate }),
        ...(data.grantDate    && { grantDate: data.grantDate }),
        ...(data.expirationDate && { expirationDate: data.expirationDate }),
        ...(data.status       && { status: data.status }),
        ...(data.abstract     && { abstract: data.abstract }),
        ...(data.cpcCodes.length && { cpcCodes: data.cpcCodes }),
        ...(data.patentNumber && { patentNumber: data.patentNumber }),
        ...(data.appNumber    && { appNumber: data.appNumber }),
      },
    })
    refreshed++
  }

  return NextResponse.json({ refreshed, failed, total: targets.length })
}
