import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Fetches abstract + claims for a US patent.
 *
 * Source priority:
 *  1. DB cache — claimsJson already populated (instant)
 *  2. USPTO ODP CLM XML — the "Claims" document in the patent's file wrapper
 *     (most reliable; is a tar archive containing USPTO ST.96 XML)
 *  3. EPO OPS — fallback for abstract and claims if ODP unavailable
 */

// ── USPTO ODP helpers ─────────────────────────────────────────────────────────

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

/**
 * Fetches the CLM (Claims) XML document from the ODP file wrapper.
 * The download is a tar archive; we find the <?xml start and parse from there.
 */
async function fetchClaimsFromOdp(appNumber: string): Promise<{
  abstract: string | null
  claims: string[]
} | null> {
  try {
    // 1. Get document list
    const docsRes = await fetch(`${ODP_BASE}/${appNumber}/documents`, {
      headers: odpHeaders(),
      signal: AbortSignal.timeout(12000),
    })
    if (!docsRes.ok) return null
    const docBag: any[] = (await docsRes.json())?.documentBag ?? []

    // 2. Find the CLM document with XML mime type (most recent first)
    const clmDoc = docBag
      .filter(d => d.documentCode === 'CLM')
      .sort((a, b) => new Date(b.officialDate ?? 0).getTime() - new Date(a.officialDate ?? 0).getTime())
      .find(d => (d.downloadOptionBag ?? []).some((o: any) => /xml/i.test(o.mimeTypeIdentifier ?? '')))

    if (!clmDoc) return null

    const xmlUrl = (clmDoc.downloadOptionBag ?? [])
      .find((o: any) => /xml/i.test(o.mimeTypeIdentifier ?? ''))?.downloadUrl
    if (!xmlUrl) return null

    // 3. Download — ODP returns a tar archive; follow redirect, read binary
    const xmlRes = await fetch(xmlUrl, {
      headers: odpHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    if (!xmlRes.ok) return null

    const buf = Buffer.from(await xmlRes.arrayBuffer())

    // 4. Find <?xml start (skip tar header bytes)
    const xmlStart = buf.indexOf(Buffer.from('<?xml'))
    if (xmlStart === -1) return null
    const xmlText = buf.subarray(xmlStart).toString('utf-8')

    return parseClmXml(xmlText)
  } catch (e) {
    console.error('[claims] ODP CLM fetch error:', e)
    return null
  }
}

/**
 * Parse USPTO ST.96 Claims XML (uspat namespace).
 * Extracts each <uspat:Claim> as clean text.
 */
function parseClmXml(xml: string): { abstract: string | null; claims: string[] } {
  const claims: string[] = []

  // Match each <uspat:Claim> block
  const claimPattern = /<uspat:Claim\b[^>]*>([\s\S]*?)<\/uspat:Claim>/gi
  let match: RegExpExecArray | null

  while ((match = claimPattern.exec(xml)) !== null) {
    const raw = match[1]

    // Replace nested <uspat:ClaimText> opening tags with spaces (they represent indented sub-clauses)
    let text = raw
      .replace(/<uspat:ClaimText>/gi, ' ')
      .replace(/<\/uspat:ClaimText>/gi, '')
      // Remove all other XML tags
      .replace(/<[^>]+>/g, '')
      // Strip amendment status markers
      .replace(/\(Currently Amended\)\s*/gi, '')
      .replace(/\(Original\)\s*/gi, '')
      .replace(/\(Canceled\)\s*/gi, '')
      .replace(/\(Previously Presented\)\s*/gi, '')
      .replace(/\(New\)\s*/gi, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()

    if (text) claims.push(text)
  }

  return { abstract: null, claims }
}

// ── EPO OPS helpers (abstract fallback) ──────────────────────────────────────

let _epoTokenCache: { token: string; expires: number } | null = null

async function getEpoToken(): Promise<string | null> {
  const key    = process.env.EPO_OPS_KEY
  const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) return null
  if (_epoTokenCache && Date.now() < _epoTokenCache.expires - 30000) return _epoTokenCache.token
  try {
    const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    _epoTokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
    return _epoTokenCache.token
  } catch { return null }
}

function extractXmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*lang="en"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return null
  return m[1].replace(/<p>/gi, '').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null
}

async function fetchAbstractFromEpo(patentNumber: string): Promise<string | null> {
  const token = await getEpoToken()
  if (!token) return null
  try {
    const bare = patentNumber.replace(/^US/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '')
    const res = await fetch(
      `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/US${bare}/abstract`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' }, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return null
    return extractXmlText(await res.text(), 'abstract')
  } catch { return null }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, patentNumber: true, abstract: true, claimsJson: true },
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── 1. DB cache — return immediately if claims are stored ─────────────────
    if (patent.claimsJson && Array.isArray(patent.claimsJson) && (patent.claimsJson as any[]).length > 0) {
      const claims = (patent.claimsJson as any[])
        .map((c: any) => (typeof c === 'string' ? c : c.claim_text ?? '').trim())
        .filter(Boolean)
      return NextResponse.json({ abstract: patent.abstract ?? null, claims, source: 'stored' })
    }

    const appNumber = patent.applicationNumber?.replace(/\D/g, '') ?? null

    // ── 2. USPTO ODP CLM XML (most reliable source for claims) ───────────────
    if (appNumber) {
      const odp = await fetchClaimsFromOdp(appNumber)
      if (odp && odp.claims.length > 0) {
        // Also try to get abstract from EPO OPS in parallel
        const abstract = patent.abstract
          ?? (patent.patentNumber ? await fetchAbstractFromEpo(patent.patentNumber) : null)
          ?? null

        const claimsJson = odp.claims.map((t, i) => ({ claim_sequence: i + 1, claim_text: t }))
        await prisma.patent.update({
          where: { id },
          data: {
            claimsJson,
            ...(abstract && !patent.abstract ? { abstract } : {}),
          },
        }).catch(() => {})

        return NextResponse.json({ abstract, claims: odp.claims, source: 'odp-clm-xml' })
      }
    }

    // ── 3. EPO OPS fallback (abstract + claims) ───────────────────────────────
    if (patent.patentNumber) {
      const abstract = patent.abstract ?? await fetchAbstractFromEpo(patent.patentNumber) ?? null
      if (abstract && !patent.abstract) {
        await prisma.patent.update({ where: { id }, data: { abstract } }).catch(() => {})
      }
      if (abstract) {
        return NextResponse.json({
          abstract,
          claims: [],
          source: 'epo-ops',
          message: 'Abstract retrieved. Full claims text not yet available for this patent.',
        })
      }
    }

    // ── 4. Nothing found ──────────────────────────────────────────────────────
    return NextResponse.json({
      abstract: patent.abstract ?? null,
      claims: [],
      source: null,
      message: appNumber
        ? 'Claims document not yet available in USPTO file wrapper'
        : 'No application number on record for this patent',
    })

  } catch (e) {
    console.error('[claims] error:', e)
    return NextResponse.json({ abstract: null, claims: [], message: 'Fetch failed' })
  }
}
