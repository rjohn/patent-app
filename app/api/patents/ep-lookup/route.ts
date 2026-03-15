import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'

export const dynamic = 'force-dynamic'

/**
 * EPO Open Patent Services API — European patent lookup
 * Base: https://ops.epo.org/3.2/rest-services
 * Docs: https://www.epo.org/en/searching-for-patents/technical/espacenet/ops
 *
 * Requires EPO_OPS_KEY + EPO_OPS_SECRET env vars (free at developers.epo.org)
 *
 * GET  /api/patents/ep-lookup?number=EP1234567   — lookup + return shaped data
 * POST /api/patents/ep-lookup                    — save to portfolio
 */

const OPS_BASE = 'https://ops.epo.org/3.2/rest-services'

// ── Auth ──────────────────────────────────────────────────────────────────────

let _tokenCache: { token: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expires - 30000) return _tokenCache.token
  const key = process.env.EPO_OPS_KEY
  const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) throw new Error('EPO_OPS_KEY and EPO_OPS_SECRET are required. Register free at developers.epo.org')
  const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`EPO auth failed: ${res.status}`)
  const data = await res.json()
  _tokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return _tokenCache.token
}

function opsHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
}

// ── Number normalization ──────────────────────────────────────────────────────

function normalizeEpNumber(raw: string): string {
  // Accept: EP1234567, EP 1234567, 1234567, EP1234567B1, EP1234567A1 etc.
  return raw.trim().replace(/^EP\s*/i, '').replace(/[.\s]/g, '').replace(/[A-Z]\d*$/i, '')
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function getTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
}

function getAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const results: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) results.push(text)
  }
  return results
}

function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i')
  const m = xml.match(re)
  return m ? m[1] : null
}

// ── Shape bibliographic XML into our internal patent shape ────────────────────

function shapeBiblio(biblioXml: string, epNumber: string) {
  // Title — prefer English
  const titleEnMatch = biblioXml.match(/<invention-title[^>]*lang="en"[^>]*>([\s\S]*?)<\/invention-title>/i)
  const titleAnyMatch = biblioXml.match(/<invention-title[^>]*>([\s\S]*?)<\/invention-title>/i)
  const title = (titleEnMatch || titleAnyMatch)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown Title'

  // Dates — EPO XML nests filing date inside <application-reference><document-id><date>
  // Grant date is a direct tag <date-of-grant>; pub date in <publication-reference>
  const filingDate = (() => {
    const appRef = biblioXml.match(/<application-reference[^>]*>[\s\S]*?<\/application-reference>/i)?.[0] || ''
    return getTag(appRef, 'date') || getTag(biblioXml, 'filing-date')
  })()
  const grantDate = getTag(biblioXml, 'date-of-grant')
  const pubDate   = (() => {
    const pubRef = biblioXml.match(/<publication-reference[^>]*>[\s\S]*?<\/publication-reference>/i)?.[0] || ''
    return getTag(pubRef, 'date') || getTag(biblioXml, 'date-of-publication') || getTag(biblioXml, 'publication-date')
  })()

  const parseEpoDate = (d: string | null): string | null => {
    if (!d) return null
    const s = d.replace(/\D/g, '')
    if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
    return null
  }

  const filingDateStr = parseEpoDate(filingDate)
  const grantDateStr  = parseEpoDate(grantDate)
  const pubDateStr    = parseEpoDate(pubDate)

  // Expiry = filing + 20 years for EP
  let expirationDate: string | null = null
  if (filingDateStr) {
    const d = new Date(filingDateStr)
    d.setFullYear(d.getFullYear() + 20)
    expirationDate = d.toISOString().slice(0, 10)
  }

  // Status — check proceedings status, kind codes, and dates
  // Kind codes: B1/B2/B3 = granted, A1/A2/A3 = published application
  const proceedingsStatus = (() => {
    const m = biblioXml.match(/<status-of-proceedings[^>]*>([^<]+)<\/status-of-proceedings>/i)
    return m ? m[1].toLowerCase().trim() : ''
  })()
  const kindCodes = (biblioXml.match(/kind="([^"]+)"/gi) || [])
    .map(m => m.replace(/kind="/i, '').replace(/"$/, '').toUpperCase())
  const hasGrantKind = kindCodes.some(k => /^B/.test(k))
  const hasAppKind   = kindCodes.some(k => /^A/.test(k))
  let status = 'PENDING'
  if (grantDateStr || hasGrantKind || proceedingsStatus.includes('grant') || proceedingsStatus.includes('opposition')) {
    status = 'GRANTED'
  } else if (hasAppKind || pubDateStr || proceedingsStatus.includes('published')) {
    status = 'PUBLISHED'
  } else if (proceedingsStatus.includes('withdrawn') || proceedingsStatus.includes('refused')) {
    status = 'ABANDONED'
  }

  // Inventors
  const inventorBlocks = biblioXml.match(/<inventor[^>]*>[\s\S]*?<\/inventor>/gi) || []
  const inventors = inventorBlocks.map(b => {
    const name = getTag(b, 'name') || [getTag(b, 'last-name'), getTag(b, 'first-name')].filter(Boolean).join(', ')
    return name
  }).filter(Boolean)

  // Applicants / assignee
  const applicantBlocks = biblioXml.match(/<applicant[^>]*>[\s\S]*?<\/applicant>/gi) || []
  const assignee = getTag(applicantBlocks[0] || '', 'name') || null

  // IPC / CPC codes
  const ipcCodes = getAllTags(biblioXml, 'classification-ipcr').slice(0, 8)
  const cpcCodes = getAllTags(biblioXml, 'classification-cpc').slice(0, 8)
  const classifications = Array.from(new Set([...ipcCodes, ...cpcCodes])).filter(Boolean)

  // Publication number
  const pubNum = `EP${epNumber}`

  return {
    patent_number:      null,           // EP grants don't have a separate "patent number"
    application_number: null,           // will be set from EP app number if available
    publication_number: pubNum,
    ep_number:          epNumber,
    title,
    status,
    type:               'UTILITY',
    jurisdiction:       'EP',
    filing_date:        filingDateStr,
    publication_date:   pubDateStr,
    grant_date:         grantDateStr,
    expiration_date:    expirationDate,
    inventors,
    assignee,
    cpc_codes:          classifications,
    raw:                biblioXml,
  }
}

function parseClaimsFromXml(xml: string): string[] {
  const section = xml.match(/<claims[^>]*lang="en"[^>]*>([\s\S]*?)<\/claims>/i)
               || xml.match(/<claims[^>]*>([\s\S]*?)<\/claims>/i)
  if (!section) return []
  const text = section[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = text.split(/(?=\b\d{1,2}\.\s)/).filter(p => p.trim())
  return parts.length > 1 ? parts.map(p => p.trim()) : [text]
}

function parseAbstractFromXml(xml: string): string | null {
  const section = xml.match(/<abstract[^>]*lang="en"[^>]*>([\s\S]*?)<\/abstract>/i)
               || xml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i)
  if (!section) return null
  return section[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

// ── GET: Lookup EP patent ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('number')?.trim()
  if (!raw) return NextResponse.json({ error: 'EP patent number required (e.g. EP1234567)' }, { status: 400 })

  try {
    const token   = await getToken()
    const epNum   = normalizeEpNumber(raw)
    const docId   = `EP${epNum}`
    const base    = `${OPS_BASE}/published-data/publication/epodoc/${docId}`
    const hdrs    = opsHeaders(token)

    // Fetch biblio, abstract, claims in parallel
    const [biblioRes, absRes, claimsRes] = await Promise.all([
      fetch(`${base}/biblio`,   { headers: hdrs, signal: AbortSignal.timeout(12000) }),
      fetch(`${base}/abstract`, { headers: hdrs, signal: AbortSignal.timeout(12000) }),
      fetch(`${base}/claims`,   { headers: hdrs, signal: AbortSignal.timeout(12000) }),
    ])

    if (!biblioRes.ok) {
      const errText = await biblioRes.text()
      if (biblioRes.status === 404) {
        return NextResponse.json({ error: `EP${epNum} not found in EPO database` }, { status: 404 })
      }
      throw new Error(`EPO biblio error ${biblioRes.status}: ${errText.slice(0, 200)}`)
    }

    const [biblioXml, absXml, claimsXml] = await Promise.all([
      biblioRes.text(),
      absRes.ok ? absRes.text() : Promise.resolve(''),
      claimsRes.ok ? claimsRes.text() : Promise.resolve(''),
    ])

    const patent   = shapeBiblio(biblioXml, epNum)
    const abstract = parseAbstractFromXml(absXml)
    const claims   = parseClaimsFromXml(claimsXml)

    return NextResponse.json({ patent: { ...patent, abstract, claims } })

  } catch (e) {
    console.error('EP lookup error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lookup failed' },
      { status: 500 }
    )
  }
}

// ── POST: Save EP patent to portfolio ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { patent: p, familyId } = await req.json()
    if (!p) return NextResponse.json({ error: 'No patent data' }, { status: 400 })

    // Duplicate check
    const existing = await prisma.patent.findFirst({
      where: {
        OR: [
          p.publication_number ? { publicationNumber: p.publication_number } : undefined,
          p.ep_number          ? { epNumber: p.ep_number }                   : undefined,
        ].filter(Boolean) as any,
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'This EP patent is already in your portfolio', existing }, { status: 409 })
    }

    const saved = await prisma.patent.create({
      data: {
        patentNumber:      null,
        applicationNumber: p.application_number || null,
        publicationNumber: p.publication_number || null,
        epNumber:          p.ep_number || null,
        title:             p.title,
        status:            p.status as any || 'PUBLISHED',
        type:              'UTILITY',
        jurisdiction:      'EP',
        filingDate:        p.filing_date      ? new Date(p.filing_date)      : null,
        publicationDate:   p.publication_date ? new Date(p.publication_date) : null,
        grantDate:         p.grant_date       ? new Date(p.grant_date)       : null,
        expirationDate:    p.expiration_date  ? new Date(p.expiration_date)  : null,
        inventors:         p.inventors        || [],
        assignee:          p.assignee         || null,
        cpcCodes:          p.cpc_codes        || [],
        abstract:          p.abstract         || null,
        claimsJson:        p.claims?.length   ? p.claims.map((t: string, i: number) => ({ claim_sequence: i + 1, claim_text: t })) : null,
        rawJsonData:       { biblioXml: p.raw } as any,
        familyId:          familyId            || null,
      },
    })

    // EP renewal fees: years 3-20, due each anniversary of filing
    // EPO fees are annual starting year 3; we auto-create years 3, 5, 7, 10, 13 as milestones
    if (saved.filingDate && saved.status === 'GRANTED') {
      const renewalYears = [3, 5, 7, 10, 13]
      await Promise.allSettled(renewalYears.map(yr => {
        const due = new Date(saved.filingDate!)
        due.setFullYear(due.getFullYear() + yr)
        const grace = new Date(due)
        grace.setMonth(grace.getMonth() + 6)
        return prisma.maintenanceFee.create({
          data: {
            patentId:       saved.id,
            feeType:        `EP_RENEWAL_YEAR_${yr}` as any,
            dueDate:        due,
            gracePeriodEnd: grace,
            status:         due < new Date() ? 'OVERDUE' : 'UPCOMING',
          },
        })
      }))
    }

    return NextResponse.json({ success: true, patent: saved }, { status: 201 })
  } catch (e) {
    console.error('EP save error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
  }
}
