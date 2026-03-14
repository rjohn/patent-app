import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

function mapStatus(s: string): string {
  const l = (s || '').toLowerCase()
  if (l.includes('patented') || l.includes('grant') || l.includes('issued')) return 'GRANTED'
  if (l.includes('abandon')) return 'ABANDONED'
  if (l.includes('expired')) return 'EXPIRED'
  if (l.includes('publish')) return 'PUBLISHED'
  return 'PENDING'
}

function mapType(code: string, label: string): string {
  const c = (code || '').toUpperCase()
  const l = (label || '').toUpperCase()
  if (c === 'DES' || l.includes('DESIGN'))                    return 'DESIGN'
  if (c === 'PLT' || l.includes('PLANT'))                     return 'PLANT'
  if (c === 'PROVSNL' || c === 'PRV' || l.includes('PROV'))   return 'PROVISIONAL'
  if (c === 'PCT')                                             return 'PCT'
  return 'UTILITY'
}

// Map any continuationType string from ODP/UI to a valid Prisma enum value (or null)
function mapContinuationType(ct: string | undefined | null): string | null {
  if (!ct) return null
  const c = ct.toUpperCase()
  if (c === 'CON' || c === 'CONTINUATION')                    return 'CONTINUATION'
  if (c === 'CIP' || c === 'CONTINUATION_IN_PART')            return 'CONTINUATION_IN_PART'
  if (c === 'DIV' || c === 'DIVISIONAL')                      return 'DIVISIONAL'
  if (c === 'REI' || c === 'REISSUE')                         return 'REISSUE'
  if (c === 'REX' || c === 'REEXAMINATION')                   return 'REEXAMINATION'
  // PRO = provisional priority claim — not a continuation type, omit
  return null
}

// Strip heavy fields from rawJson before storing to keep payload small
function slimJson(data: any): any {
  if (!data) return null
  try {
    const bag = data?.patentFileWrapperDataBag?.[0]
    if (!bag) return null
    const meta = bag.applicationMetaData || {}
    return {
      applicationNumberText: bag.applicationNumberText,
      applicationMetaData: {
        applicationStatusCode:         meta.applicationStatusCode,
        applicationStatusDescriptionText: meta.applicationStatusDescriptionText,
        applicationTypeCode:           meta.applicationTypeCode,
        applicationTypeCategory:       meta.applicationTypeCategory,
        applicationTypeLabelName:      meta.applicationTypeLabelName,
        filingDate:                    meta.filingDate,
        grantDate:                     meta.grantDate,
        earliestPublicationDate:       meta.earliestPublicationDate,
        patentNumber:                  meta.patentNumber,
        inventionTitle:                meta.inventionTitle,
        firstInventorName:             meta.firstInventorName,
        firstApplicantName:            meta.firstApplicantName,
      },
    }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { applicationNumber, continuationType, parentPatentId, familyId } = body

    if (!applicationNumber) {
      return NextResponse.json({ error: 'applicationNumber required' }, { status: 400 })
    }

    const cleanNum = applicationNumber.replace(/[\/,\s]/g, '')

    // Check if already in DB — exact match or with slash formatting
    const existing = await prisma.patent.findFirst({
      where: {
        OR: [
          { applicationNumber: cleanNum },
          { applicationNumber: `${cleanNum.slice(0,2)}/${cleanNum.slice(2,6)}/${cleanNum.slice(6)}` },
        ].filter(o => Object.values(o)[0])
      },
      select: { id: true, title: true, applicationNumber: true }
    })
    if (existing) {
      return NextResponse.json({ error: 'Application already in portfolio', existing }, { status: 409 })
    }

    // Fetch from ODP
    const searchUrl = new URL(`${ODP_BASE}/search`)
    searchUrl.searchParams.set('q', `applicationNumberText:${cleanNum}`)
    searchUrl.searchParams.set('limit', '1')

    let appMeta: any = {}
    let rawJson: any = null

    try {
      const searchRes = await fetch(searchUrl.toString(), {
        headers: odpHeaders(),
        signal: AbortSignal.timeout(15000),
      })
      if (searchRes.ok) {
        const data = await searchRes.json()
        const record = data?.patentFileWrapperDataBag?.[0] || {}
        appMeta = record.applicationMetaData || {}
        rawJson = data
      }
    } catch {
      // Proceed with minimal data if ODP is unavailable
    }

    const title       = appMeta.inventionTitle || appMeta.patentTitle || `Application ${applicationNumber}`
    const patentNumber = appMeta.patentNumber || null
    const status      = mapStatus(appMeta.applicationStatusDescriptionText || '')
    const type        = mapType(appMeta.applicationTypeCategory || appMeta.applicationTypeCode || '', appMeta.applicationTypeLabelName || '')

    const inventors = (appMeta.inventorBag || [])
      .map((inv: any) => inv.inventorNameText || [inv.firstName, inv.middleName, inv.lastName].filter(Boolean).join(' ').trim())
      .filter(Boolean)

    const cpcCodes = (appMeta.cpcClassificationBag || [])
      .map((c: any) => (typeof c === 'string' ? c : c?.cpcClassificationText || ''))
      .filter(Boolean)

    // For provisionals, expiration is 1 year; for others 20 years
    let expirationDate: Date | null = null
    if (appMeta.filingDate) {
      const d = new Date(appMeta.filingDate)
      d.setFullYear(d.getFullYear() + (type === 'PROVISIONAL' ? 1 : 20))
      expirationDate = d
    }

    const mappedContinuationType = mapContinuationType(continuationType)

    // Build create data — omit applicationNumber if it would conflict with unique constraint
    // Use a try/catch to handle edge case where unique constraint fires despite our check
    const createData: any = {
      title,
      status:          status as any,
      type:            type as any,
      jurisdiction:    'US',
      source:          'CONTINUATION',
      filingDate:      appMeta.filingDate                 ? new Date(appMeta.filingDate)                 : null,
      publicationDate: appMeta.earliestPublicationDate    ? new Date(appMeta.earliestPublicationDate)    : null,
      grantDate:       appMeta.grantDate                  ? new Date(appMeta.grantDate)                  : null,
      expirationDate,
      inventors,
      assignee:        appMeta.applicantBag?.[0]?.applicantNameText || appMeta.firstApplicantName || null,
      cpcCodes,
      rawJsonData:     slimJson(rawJson),
      ...(patentNumber           ? { patentNumber }    : {}),
      ...(cleanNum               ? { applicationNumber: cleanNum } : {}),
      ...(mappedContinuationType ? { continuationType: mappedContinuationType as any } : {}),
      ...(parentPatentId         ? { parentPatentId }  : {}),
      ...(familyId               ? { familyId }        : {}),
    }

    const saved = await prisma.patent.create({ data: createData })
    return NextResponse.json({ success: true, patent: saved }, { status: 201 })

  } catch (e: any) {
    console.error('import-application error:', e)
    // Prisma unique constraint error code
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Application already in portfolio (duplicate)' }, { status: 409 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 500 })
  }
}
