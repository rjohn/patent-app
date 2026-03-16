import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Fetches abstract + claims.
 *
 * Source priority:
 *  1. DB cache       — already stored from a previous fetch (instant)
 *  2. EPO OPS API    — free, supports US patents, returns structured XML with abstract + claims
 *                      Requires EPO_OPS_KEY env var (free registration at ops.epo.org)
 *  3. ODP XML docs   — download the XML grant document from the USPTO file wrapper
 */

// ── EPO OPS ───────────────────────────────────────────────────────────────────
// Docs: https://ops.epo.org/3.2/rest-services
// Endpoint: GET /rest-services/published-data/publication/epodoc/{docNum}/abstract
//           GET /rest-services/published-data/publication/epodoc/{docNum}/claims
// Doc number format for US grants: "US{patentNumber}" e.g. "US10064263"

async function getEpoToken(): Promise<string | null> {
  const key    = process.env.EPO_OPS_KEY    // consumer key
  const secret = process.env.EPO_OPS_SECRET // consumer secret
  if (!key || !secret) return null

  const creds = Buffer.from(`${key}:${secret}`).toString('base64')
  try {
    const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token || null
  } catch { return null }
}

function extractTextFromOpsXml(xml: string, tag: string): string | null {
  // EPO OPS returns XML like:
  // <abstract lang="en"><p>Some text here...</p></abstract>
  // <claims lang="en"><claim-text>1. A method...</claim-text></claims>
  const match = xml.match(new RegExp(`<${tag}[^>]*lang="en"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match) return null
  return match[1]
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<claim-text>/gi, '')
    .replace(/<\/claim-text>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

function parseClaimsText(claimsText: string): string[] {
  if (!claimsText) return []
  // Split on numbered claim boundaries: "1. " "2. " etc.
  const parts = claimsText.split(/(?=\b\d{1,2}\.\s)/).filter(p => p.trim())
  if (parts.length > 1) return parts.map(p => p.trim()).filter(Boolean)
  // Fallback: return as single claim
  return [claimsText.trim()]
}

async function fetchFromEpo(patentNumber: string): Promise<{
  abstract: string | null; claims: string[]
} | null> {
  const token = await getEpoToken()
  if (!token) return null

  const bare = patentNumber.replace(/^US/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '')
  const docNum = `US${bare}`
  const base = 'https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc'
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/xml',
  }

  const fulltextBase = 'https://ops.epo.org/3.2/rest-services/fulltext/publication/epodoc'

  try {
    const [absRes, claimsRes, ftClaimsRes] = await Promise.all([
      fetch(`${base}/${docNum}/abstract`,       { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/${docNum}/claims`,          { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${fulltextBase}/${docNum}/claims`,  { headers, signal: AbortSignal.timeout(10000) }),
    ])

    console.log(`[claims/route] ${docNum} abstract=${absRes.status} pub-claims=${claimsRes.status} ft-claims=${ftClaimsRes.status}`)

    const abstract = absRes.ok
      ? extractTextFromOpsXml(await absRes.text(), 'abstract')
      : null

    // Try published-data claims first, then fulltext claims
    let claimsRaw: string | null = null
    if (claimsRes.ok) {
      claimsRaw = extractTextFromOpsXml(await claimsRes.text(), 'claims')
    }
    if (!claimsRaw && ftClaimsRes.ok) {
      claimsRaw = extractTextFromOpsXml(await ftClaimsRes.text(), 'claims')
    }
    const claims = claimsRaw ? parseClaimsText(claimsRaw) : []

    console.log(`[claims/route] ${docNum} → abstract=${!!abstract} claims=${claims.length}`)
    if (!abstract && claims.length === 0) return null
    return { abstract, claims }
  } catch (e) {
    console.error(`[claims/route] fetchFromEpo error for ${docNum}:`, e)
    return null
  }
}

// ── ODP XML documents fallback ────────────────────────────────────────────────
const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

function parseFromXml(xml: string): { abstract: string | null; claims: string[] } {
  const claims: string[] = []

  const absMatch = xml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i)
  const abstract = absMatch
    ? absMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
    : null

  const claimRegex = /<claim[^>]*>([\s\S]*?)<\/claim>/gi
  let m
  while ((m = claimRegex.exec(xml)) !== null) {
    const text = m[1]
      .replace(/<claim-text>/gi, '').replace(/<\/claim-text>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (text) claims.push(text)
  }
  return { abstract, claims }
}

async function fetchFromOdpXml(appNumber: string): Promise<{
  abstract: string | null; claims: string[]
} | null> {
  try {
    const docsRes = await fetch(`${ODP_BASE}/${appNumber}/documents`, {
      headers: odpHeaders(), signal: AbortSignal.timeout(10000),
    })
    if (!docsRes.ok) return null

    const docBag: any[] = (await docsRes.json())?.documentBag || []

    // Prefer the grant XML (documentCode contains GRANT/ISSUE), fall back to any XML
    const xmlDoc =
      docBag.find(d =>
        /grant|issue/i.test(d.documentCode || '') &&
        (d.downloadOptionBag || []).some((o: any) => /xml/i.test(o.mimeTypeIdentifier || ''))
      ) ||
      docBag.find(d =>
        (d.downloadOptionBag || []).some((o: any) => /xml/i.test(o.mimeTypeIdentifier || ''))
      )

    const xmlUrl = (xmlDoc?.downloadOptionBag || [])
      .find((o: any) => /xml/i.test(o.mimeTypeIdentifier || ''))?.downloadUrl
    if (!xmlUrl) return null

    const xmlRes = await fetch(xmlUrl, { headers: odpHeaders(), signal: AbortSignal.timeout(20000) })
    if (!xmlRes.ok) return null

    const result = parseFromXml(await xmlRes.text())
    return (result.abstract || result.claims.length > 0) ? result : null
  } catch { return null }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, patentNumber: true, abstract: true, claimsJson: true, rawJsonData: true },
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── 1. DB cache — return if we have claims stored (abstract optional)
    if (patent.claimsJson && (patent.claimsJson as any[]).length > 0) {
      const claims = (patent.claimsJson as any[])
        .map((c: any) => (typeof c === 'string' ? c : c.claim_text || '').trim())
        .filter(Boolean)
      return NextResponse.json({ abstract: patent.abstract || null, claims, source: 'stored' })
    }

    // ── 1b. Abstract stored in rawJsonData from ODP refresh
    const rawAbstract = (patent.rawJsonData as any)?.patentFileWrapperDataBag?.[0]?.applicationMetaData?.abstractText || null

    // ── 2. EPO OPS (requires EPO_OPS_KEY + EPO_OPS_SECRET env vars)
    let epoAbstract: string | null = null
    if (patent.patentNumber) {
      const epo = await fetchFromEpo(patent.patentNumber)
      if (epo && epo.claims.length > 0) {
        const updateData: any = {}
        if (epo.abstract) updateData.abstract = epo.abstract
        updateData.claimsJson = epo.claims.map((t, i) => ({ claim_sequence: i + 1, claim_text: t }))
        await prisma.patent.update({ where: { id }, data: updateData }).catch(() => {})
        return NextResponse.json({ ...epo, source: 'epo-ops' })
      }
      // EPO had abstract but no claims — save abstract and continue to ODP fallback
      if (epo?.abstract) epoAbstract = epo.abstract
    }

    // ── 3. ODP XML document download
    if (patent.applicationNumber) {
      const odp = await fetchFromOdpXml(patent.applicationNumber)
      if (odp) {
        const updateData: any = {}
        if (odp.abstract) updateData.abstract = odp.abstract
        if (odp.claims.length > 0) updateData.claimsJson = odp.claims.map((t, i) => ({ claim_sequence: i + 1, claim_text: t }))
        if (Object.keys(updateData).length > 0) {
          await prisma.patent.update({ where: { id }, data: updateData }).catch(() => {})
        }
        return NextResponse.json({ ...odp, source: 'odp-xml' })
      }
    }

    // ── 5. Return whatever is in DB (including rawJsonData abstract or EPO abstract)
    const fallbackAbstract = patent.abstract || epoAbstract || rawAbstract || null
    if (fallbackAbstract) {
      // Save it back to the abstract field for next time
      if (!patent.abstract && rawAbstract) {
        await prisma.patent.update({ where: { id }, data: { abstract: rawAbstract } }).catch(() => {})
      }
    }
    return NextResponse.json({
      abstract: fallbackAbstract,
      claims: [],
      source: fallbackAbstract ? 'stored' : null,
      message: !fallbackAbstract
        ? (!process.env.EPO_OPS_KEY
            ? 'Add EPO_OPS_KEY + EPO_OPS_SECRET to .env.local for claims retrieval'
            : 'Claims text not available for this patent')
        : null,
    })

  } catch (e) {
    console.error('Claims/abstract error:', e)
    return NextResponse.json({ abstract: null, claims: [], message: 'Fetch failed' })
  }
}
