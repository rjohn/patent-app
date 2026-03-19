import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'
const OPS_BASE = 'https://ops.epo.org/3.2/rest-services'

// ── USPTO ODP helpers ─────────────────────────────────────────────────────────

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

async function fetchOdpData(appNumber: string | null, patentNumber: string | null) {
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

// ── EPO OPS helpers (for abstract text) ──────────────────────────────────────

let _tokenCache: { token: string; expires: number } | null = null

async function getOpsToken(): Promise<string | null> {
  const key    = process.env.EPO_OPS_KEY
  const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) return null
  if (_tokenCache && Date.now() < _tokenCache.expires - 30000) return _tokenCache.token
  try {
    const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    _tokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
    return _tokenCache.token
  } catch {
    return null
  }
}

function extractXmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
}

async function fetchAbstractFromOps(patentNumber: string): Promise<string | null> {
  const token = await getOpsToken()
  if (!token) return null
  try {
    // EPO OPS has worldwide patent data including US grants
    const num = patentNumber.replace(/\D/g, '')
    const url = `${OPS_BASE}/published-data/publication/us/${num}/abstract`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const xml = await res.text()
    return extractXmlText(xml, 'abstract') || extractXmlText(xml, 'p')
  } catch {
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

// POST /api/watchlists/[id]/patents/refresh
// Body: {} to refresh all entries missing abstracts, or { entryId } for one entry
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
    : watchlist.entries.filter(e => !e.abstract)

  if (targets.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'All entries already have abstracts' })
  }

  let refreshed = 0
  let failed = 0

  for (const entry of targets) {
    try {
      // Step 1: get bibliographic data from USPTO ODP
      const odp = await fetchOdpData(entry.appNumber, entry.patentNumber)

      // Step 2: get abstract from EPO OPS (has worldwide full text including US grants)
      const resolvedPatentNum = odp?.patentNumber || entry.patentNumber
      const abstract = resolvedPatentNum
        ? await fetchAbstractFromOps(resolvedPatentNum)
        : null

      if (!odp && !abstract) { failed++; continue }

      await prisma.watchlistEntry.update({
        where: { id: entry.id },
        data: {
          ...(odp?.title            && { title: odp.title }),
          ...(odp?.assignee         && { assignee: odp.assignee }),
          ...(odp?.inventors?.length && { inventors: odp.inventors }),
          ...(odp?.filingDate       && { filingDate: odp.filingDate }),
          ...(odp?.grantDate        && { grantDate: odp.grantDate }),
          ...(odp?.expirationDate   && { expirationDate: odp.expirationDate }),
          ...(odp?.status           && { status: odp.status }),
          ...(odp?.cpcCodes?.length && { cpcCodes: odp.cpcCodes }),
          ...(odp?.patentNumber     && { patentNumber: odp.patentNumber }),
          ...(odp?.appNumber        && { appNumber: odp.appNumber }),
          ...(abstract              && { abstract }),
        },
      })
      refreshed++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ refreshed, failed, total: targets.length })
}
