import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'

export const dynamic = 'force-dynamic'

/**
 * USPTO Open Data Portal — Patent File Wrapper API
 * Base: https://api.uspto.gov/api/v1/patent/applications
 * Docs: https://data.uspto.gov/apis/patent-file-wrapper
 *
 * Two-step lookup for a patent number:
 *   1. Search by patentNumber  → get applicationNumberText
 *   2. Fetch /meta-data        → get full bibliographic data
 *   3. (Optional) /continuity → family relationships
 */

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

/** Normalize a patent number to bare digits, e.g. "US 11,234,567 B2" → "11234567" */
function normalizePatentNumber(raw: string): string {
  return raw
    .replace(/^US\s*/i, '')   // strip leading US
    .replace(/[,\s]/g, '')    // strip commas & spaces
    .replace(/[A-Z]\d*$/i, '') // strip kind code (B2, A1, etc.)
    .trim()
}

/** Step 1: Search by patent number — returns the full response bag */
async function searchByPatentNumber(patentNumber: string): Promise<any | null> {
  const url = new URL(`${ODP_BASE}/search`)
  url.searchParams.set('q', `applicationMetaData.patentNumber:${patentNumber}`)
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), { headers: odpHeaders() })
  if (res.status === 404) return null   // no match — fall through to app-number search
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ODP search error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data  // contains patentFileWrapperDataBag
}

/** Step 2: Fetch by application number directly */
async function fetchByAppNumber(appNumber: string): Promise<any | null> {
  const url = new URL(`${ODP_BASE}/search`)
  url.searchParams.set('q', `applicationNumberText:${appNumber}`)
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), { headers: odpHeaders() })
  if (!res.ok) return null

  const data = await res.json()
  return data
}

/** Step 3: Fetch continuity (family) data */
async function fetchContinuity(appNumber: string): Promise<any> {
  const url = `${ODP_BASE}/${appNumber}/continuity`
  const res = await fetch(url, { headers: odpHeaders() })
  if (!res.ok) return null
  return res.json()
}

/** Map ODP metadata response into our internal shape */
function shapePatent(meta: any, continuity: any, rawAppNumber: string) {
  // Response shape: { patentFileWrapperDataBag: [ { applicationMetaData: {...}, applicationNumberText } ] }
  const record  = meta?.patentFileWrapperDataBag?.[0] || {}
  const appMeta = record?.applicationMetaData || {}
  const inventors = (appMeta.inventorBag || []).map((inv: any) =>
    [inv.inventorNameText || `${inv.inventorFirstNameText || ''} ${inv.inventorLastNameText || ''}`.trim()]
      .filter(Boolean)
      .join('')
  )

  const assignee =
    appMeta.applicantBag?.[0]?.applicantNameText ||
    appMeta.firstApplicantName ||
    null

  const cpcCodes = (appMeta.cpcClassificationBag || [])
    .map((c: any) => (typeof c === 'string' ? c : c?.cpcClassificationText || ''))
    .filter(Boolean)

  const type = mapAppType(appMeta.applicationTypeCode || '')

  // Continuity: parent chain
  const parentBag = continuity?.parentContinuityBag || []
  const parent = parentBag[0] || null

  // Expiration = filing date + 20 years (utility)
  let expirationDate: string | null = null
  const grantDateForExpiry = appMeta.grantDate || appMeta.patentGrantDate
  if (appMeta.filingDate) {
    const d = new Date(appMeta.filingDate)
    d.setFullYear(d.getFullYear() + 20)
    expirationDate = d.toISOString().split('T')[0]
  }

  return {
    application_number:    rawAppNumber,
    patent_number:         appMeta.patentNumber || null,
    publication_number:    appMeta.earliestPublicationNumber || null,
    title:                 appMeta.inventionTitle || appMeta.patentTitle || 'Unknown Title',
    status:                mapStatus(appMeta.applicationStatusDescriptionText || appMeta.applicationStatusCode || ''),
    type,
    filing_date:           appMeta.filingDate || null,
    publication_date:      appMeta.earliestPublicationDate || null,
    grant_date:            appMeta.grantDate || appMeta.patentGrantDate || null,
    expiration_date:       expirationDate,
    inventors,
    assignee,
    examiner:              appMeta.examinerNameText || null,
    art_unit:              appMeta.groupArtUnitNumber || null,
    cpc_codes:             cpcCodes,
    entity_status:         appMeta.entityStatusData?.businessEntityStatusCategory || null,
    // Continuity
    parent_app_number:     parent?.parentApplicationNumberText || null,
    parent_patent_number:  parent?.parentPatentNumber || null,
    continuation_type:     parent ? mapContinuationType(parent.continuityTypeCode || '') : null,
    child_count:           (continuity?.childContinuityBag || []).length,
    raw: meta,
  }
}

function mapStatus(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('patented') || s.includes('grant') || s.includes('issued')) return 'GRANTED'
  if (s.includes('pending') || s.includes('filed') || s.includes('docketed')) return 'PENDING'
  if (s.includes('abandon')) return 'ABANDONED'
  if (s.includes('expired')) return 'EXPIRED'
  if (s.includes('publish')) return 'PUBLISHED'
  return 'PENDING'
}

function mapAppType(code: string): string {
  const c = code.toUpperCase()
  if (c === 'DES' || c.includes('DESIGN'))      return 'DESIGN'
  if (c === 'PLT' || c.includes('PLANT'))        return 'PLANT'
  if (c === 'PRV' || c.includes('PROVISIONAL'))  return 'PROVISIONAL'
  if (c === 'PCT')                               return 'PCT'
  return 'UTILITY'
}

function mapContinuationType(code: string): string | null {
  const map: Record<string, string> = {
    'CON': 'CONTINUATION',
    'CIP': 'CONTINUATION_IN_PART',
    'DIV': 'DIVISIONAL',
    'REI': 'REISSUE',
    'REX': 'REEXAMINATION',
  }
  return map[code.toUpperCase()] || null
}

// ─── GET: Lookup patent by number ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawNumber = searchParams.get('number')?.trim()

  if (!rawNumber) {
    return NextResponse.json({ error: 'Patent number required' }, { status: 400 })
  }

  try {
    const normalized = normalizePatentNumber(rawNumber)

    // Step 1: Search by patent number (returns null on 404)
    let searchResult = await searchByPatentNumber(normalized)
    let bag = searchResult?.patentFileWrapperDataBag || []

    // Step 2: If not found, try treating input as an application number
    if (bag.length === 0) {
      const bareApp = rawNumber.replace(/[\/,\s]/g, '')
      if (/^\d{7,8}$/.test(bareApp)) {
        searchResult = await fetchByAppNumber(bareApp)
        bag = searchResult?.patentFileWrapperDataBag || []
      }
      if (bag.length === 0) {
        return NextResponse.json(
          { error: `No patent found for "${rawNumber}" in the USPTO Open Data Portal` },
          { status: 404 }
        )
      }
    }

    const appNumber = bag[0]?.applicationNumberText || normalized

    // Step 3: Fetch continuity in parallel (search result already has full metadata)
    const continuity = await fetchContinuity(appNumber).catch(() => null)

    const patent = shapePatent(searchResult, continuity, appNumber)
    return NextResponse.json({ patent })

  } catch (e) {
    console.error('ODP lookup error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lookup failed' },
      { status: 500 }
    )
  }
}

// ─── POST: Save patent to portfolio ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { patent: p, familyId } = await req.json()
    if (!p) return NextResponse.json({ error: 'No patent data' }, { status: 400 })

    // Check duplicate
    const existing = await prisma.patent.findFirst({
      where: {
        OR: [
          p.patent_number      ? { patentNumber:      p.patent_number }      : undefined,
          p.application_number ? { applicationNumber: p.application_number } : undefined,
        ].filter(Boolean) as any,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Patent already exists in your portfolio', existing },
        { status: 409 }
      )
    }

    const status = (p.status || 'GRANTED') as string
    const isApplication = status === 'PENDING' || status === 'PUBLISHED'

    const saved = await prisma.patent.create({
      data: {
        patentNumber:      p.patent_number || null,
        applicationNumber: p.application_number || null,
        publicationNumber: p.publication_number || null,
        title:             p.title,
        status:            status as any,
        type:              p.type   as any || 'UTILITY',
        source:            isApplication ? 'CONTINUATION' : 'PORTFOLIO',
        filingDate:        p.filing_date      ? new Date(p.filing_date)      : null,
        publicationDate:   p.publication_date ? new Date(p.publication_date) : null,
        grantDate:         p.grant_date       ? new Date(p.grant_date)       : null,
        expirationDate:    p.expiration_date  ? new Date(p.expiration_date)  : null,
        inventors:         p.inventors  || [],
        assignee:          p.assignee   || null,
        cpcCodes:          p.cpc_codes  || [],
        continuationType:  p.continuation_type as any || null,
        familyId:          familyId || null,
        rawJsonData:       p.raw || null,
      },
    })

    // Auto-generate US maintenance fees for utility patents
    if (saved.grantDate && saved.type === 'UTILITY') {
      const fees = calculateMaintenanceFees(saved.grantDate)
      await Promise.allSettled(
        fees.map(fee =>
          prisma.maintenanceFee.create({
            data: {
              patentId:       saved.id,
              feeType:        fee.feeType as any,
              dueDate:        fee.dueDate,
              gracePeriodEnd: fee.gracePeriodEnd,
              status:         'UPCOMING',
            },
          })
        )
      )
    }

    return NextResponse.json({ success: true, patent: saved }, { status: 201 })
  } catch (e) {
    console.error('ODP save error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Save failed' },
      { status: 500 }
    )
  }
}
