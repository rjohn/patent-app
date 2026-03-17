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
  if (l.includes('abandon')) return 'ABANDONED'
  if (l.includes('expired')) return 'EXPIRED'
  if (l.includes('publish')) return 'PUBLISHED'
  return 'PENDING'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const company = searchParams.get('company')?.trim()
  const start   = parseInt(searchParams.get('start') || '0')
  const limit   = Math.min(parseInt(searchParams.get('limit') || '25'), 50)

  if (!company) return NextResponse.json({ error: 'company param required' }, { status: 400 })

  try {
    const url = new URL(`${ODP_BASE}/search`)
    // Search by applicant name — wildcard for partial matches
    url.searchParams.set('q', `applicationMetaData.applicantBag.applicantNameText:*${company}*`)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('start', String(start))

    const res = await fetch(url.toString(), {
      headers: odpHeaders(),
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 404) {
      return NextResponse.json({ patents: [], total: 0, start, limit })
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ODP error ${res.status}: ${text}`)
    }

    const data = await res.json()
    const bag: any[] = data?.patentFileWrapperDataBag || []
    const total: number = data?.recordTotalQuantity ?? bag.length

    const patents = bag.map((rec: any) => {
      const meta = rec.applicationMetaData || {}
      const inventors = (meta.inventorBag || [])
        .map((inv: any) => inv.inventorNameText || `${inv.firstName || ''} ${inv.lastName || ''}`.trim())
        .filter(Boolean)
      const assignee = meta.applicantBag?.[0]?.applicantNameText || meta.firstApplicantName || null

      return {
        applicationNumber: rec.applicationNumberText || '',
        patentNumber:      meta.patentNumber || null,
        title:             meta.inventionTitle || meta.patentTitle || 'Untitled',
        status:            mapStatus(meta.applicationStatusDescriptionText || meta.applicationStatusCode || ''),
        type:              meta.applicationTypeCode || 'UTILITY',
        filingDate:        meta.filingDate || null,
        grantDate:         meta.grantDate || null,
        assignee,
        inventors,
      }
    })

    // Check which are already in the portfolio
    const appNums     = patents.map(p => p.applicationNumber).filter(Boolean)
    const patentNums  = patents.map(p => p.patentNumber).filter(Boolean) as string[]
    const existing    = await prisma.patent.findMany({
      where: {
        OR: [
          { applicationNumber: { in: appNums } },
          ...(patentNums.length ? [{ patentNumber: { in: patentNums } }] : []),
        ],
      },
      select: { applicationNumber: true, patentNumber: true },
    })
    const existingAppNums = new Set(existing.map(e => e.applicationNumber).filter(Boolean))
    const existingPatNums = new Set(existing.map(e => e.patentNumber).filter(Boolean))

    const enriched = patents.map(p => ({
      ...p,
      inPortfolio: existingAppNums.has(p.applicationNumber) || (!!p.patentNumber && existingPatNums.has(p.patentNumber)),
    }))

    return NextResponse.json({ patents: enriched, total, start, limit })
  } catch (e: any) {
    console.error('company-search error:', e)
    return NextResponse.json({ error: e?.message || 'Search failed' }, { status: 500 })
  }
}
