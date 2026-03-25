import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchClaimsFromOdp, fetchAbstractFromEpo } from '@/lib/patent-fulltext'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, patentNumber: true, abstract: true, claimsJson: true, type: true },
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Provisional applications have no examined claims
    if (patent.type === 'PROVISIONAL') {
      return NextResponse.json({
        abstract: patent.abstract ?? null,
        claims: [],
        source: null,
        message: 'Provisional applications do not have formal claims. A provisional establishes a priority date only — claims are filed in the subsequent non-provisional application.',
      })
    }

    // 1. DB cache
    if (patent.claimsJson && Array.isArray(patent.claimsJson) && (patent.claimsJson as any[]).length > 0) {
      const claims = (patent.claimsJson as any[])
        .map((c: any) => (typeof c === 'string' ? c : c.claim_text ?? '').trim())
        .filter(Boolean)
      return NextResponse.json({ abstract: patent.abstract ?? null, claims, source: 'stored' })
    }

    const appNumber = patent.applicationNumber?.replace(/\D/g, '') ?? null

    // 2. USPTO ODP CLM XML
    if (appNumber) {
      const odp = await fetchClaimsFromOdp(appNumber)
      if (odp && odp.claims.length > 0) {
        const abstract = patent.abstract
          ?? (patent.patentNumber ? await fetchAbstractFromEpo(patent.patentNumber) : null)
          ?? null
        const claimsJson = odp.claims.map((t, i) => ({ claim_sequence: i + 1, claim_text: t }))
        await prisma.patent.update({
          where: { id },
          data: { claimsJson, ...(abstract && !patent.abstract ? { abstract } : {}) },
        }).catch(() => {})
        return NextResponse.json({ abstract, claims: odp.claims, source: 'odp-clm-xml' })
      }
    }

    // 3. EPO OPS fallback (abstract only for most US patents)
    if (patent.patentNumber) {
      const abstract = patent.abstract ?? await fetchAbstractFromEpo(patent.patentNumber) ?? null
      if (abstract && !patent.abstract) {
        await prisma.patent.update({ where: { id }, data: { abstract } }).catch(() => {})
      }
      if (abstract) {
        return NextResponse.json({
          abstract, claims: [], source: 'epo-ops',
          message: 'Abstract retrieved. Claims document not yet available in USPTO file wrapper.',
        })
      }
    }

    return NextResponse.json({
      abstract: patent.abstract ?? null, claims: [], source: null,
      message: appNumber
        ? 'Claims document not yet available in USPTO file wrapper'
        : 'No application number on record for this patent',
    })
  } catch (e) {
    console.error('[claims] error:', e)
    return NextResponse.json({ abstract: null, claims: [], message: 'Fetch failed' })
  }
}
