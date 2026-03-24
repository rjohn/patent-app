import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchClaimsFromOdp, fetchAbstractFromEpo, odpHeaders } from '@/lib/patent-fulltext'

export const dynamic = 'force-dynamic'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function mapStatus(s: string): string {
  const l = (s || '').toLowerCase()
  if (l.includes('patented') || l.includes('grant') || l.includes('issued')) return 'GRANTED'
  if (l.includes('abandon'))  return 'ABANDONED'
  if (l.includes('expired'))  return 'EXPIRED'
  if (l.includes('publish'))  return 'PUBLISHED'
  return 'PENDING'
}

async function fetchOdpBiblio(appNumber: string | null, patentNumber: string | null) {
  try {
    const q = appNumber
      ? `applicationNumberText:${appNumber.replace(/\D/g, '')}`
      : `applicationMetaData.patentNumber:${(patentNumber || '').replace(/\D/g, '')}`

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
      .map((inv: any) => inv.inventorNameText ||
        `${inv.inventorFirstNameText || ''} ${inv.inventorLastNameText || ''}`.trim())
      .filter(Boolean) as string[]

    const assignee = meta.applicantBag?.[0]?.applicantNameText || meta.firstApplicantName || null

    const cpcCodes = (meta.cpcClassificationBag || [])
      .map((c: any) => (typeof c === 'string' ? c : c?.cpcClassificationText || ''))
      .filter(Boolean) as string[]

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
      cpcCodes,
      patentNumber:   meta.patentNumber || null,
      appNumber:      record.applicationNumberText || null,
    }
  } catch {
    return null
  }
}

// POST /api/watchlists/[id]/patents/refresh
// Body: {} → refresh all entries missing abstract or claims
//       { entryId } → refresh one specific entry
//       { force: true } → refresh ALL entries regardless of existing data
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: watchlistId } = await params
  const body = await req.json().catch(() => ({}))
  const { entryId, force } = body

  const watchlist = await prisma.watchlist.findUnique({
    where: { id: watchlistId },
    include: { entries: true },
  })
  if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Target: specific entry, all entries (force), or entries missing abstract/claims
  const targets = entryId
    ? watchlist.entries.filter(e => e.id === entryId)
    : force
      ? watchlist.entries
      : watchlist.entries.filter(e => !e.abstract || !e.claimsJson)

  if (targets.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'All entries already have full data' })
  }

  let refreshed = 0
  let failed    = 0
  const results: { id: string; title: string | null; claims: number; abstract: boolean }[] = []

  for (const entry of targets) {
    try {
      // Fetch biblio first — it may give us an appNumber we don't have yet
      const initialAppNum = entry.appNumber?.replace(/\D/g, '') || null
      const biblio = await fetchOdpBiblio(initialAppNum, entry.patentNumber)

      // Use appNumber from biblio if the entry didn't have one (added by patent number only)
      const resolvedAppNum = initialAppNum || biblio?.appNumber?.replace(/\D/g, '') || null

      const patentNum = biblio?.patentNumber || entry.patentNumber || null

      // Now fetch claims + abstract in parallel with the resolved app number
      const [claimsResult, fetchedAbstract] = await Promise.all([
        resolvedAppNum ? fetchClaimsFromOdp(resolvedAppNum) : Promise.resolve(null),
        patentNum ? fetchAbstractFromEpo(patentNum) : Promise.resolve(null),
      ])

      // Keep existing abstract if fetch returned nothing
      const abstract = fetchedAbstract || entry.abstract || null

      const claimsJson = claimsResult?.claims?.length
        ? claimsResult.claims.map((t, i) => ({ claim_sequence: i + 1, claim_text: t }))
        : null

      if (!biblio && !abstract && !claimsJson) { failed++; continue }

      await prisma.watchlistEntry.update({
        where: { id: entry.id },
        data: {
          ...(biblio?.title            && { title:          biblio.title }),
          ...(biblio?.assignee         && { assignee:       biblio.assignee }),
          ...(biblio?.inventors?.length && { inventors:     biblio.inventors }),
          ...(biblio?.filingDate       && { filingDate:     biblio.filingDate }),
          ...(biblio?.grantDate        && { grantDate:      biblio.grantDate }),
          ...(biblio?.expirationDate   && { expirationDate: biblio.expirationDate }),
          ...(biblio?.status           && { status:         biblio.status }),
          ...(biblio?.cpcCodes?.length && { cpcCodes:       biblio.cpcCodes }),
          ...(biblio?.patentNumber     && { patentNumber:   biblio.patentNumber }),
          ...(biblio?.appNumber        && { appNumber:      biblio.appNumber }),
          ...(abstract                 && { abstract }),
          ...(claimsJson               && { claimsJson }),
        },
      })

      results.push({
        id:       entry.id,
        title:    biblio?.title || entry.title,
        claims:   claimsResult?.claims?.length ?? 0,
        abstract: !!abstract,
      })
      refreshed++
    } catch (e) {
      console.error('[watchlist refresh] entry error:', e)
      failed++
    }
  }

  return NextResponse.json({ refreshed, failed, total: targets.length, results })
}
