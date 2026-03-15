import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

function mapConType(t: string): string {
  const u = (t || '').toUpperCase()
  if (u === 'CIP' || u.includes('CONTINUATION IN PART')) return 'CONTINUATION_IN_PART'
  if (u === 'CON' || u.includes('CONTINUATION'))         return 'CONTINUATION'
  if (u === 'DIV' || u.includes('DIVISIONAL'))           return 'DIVISIONAL'
  if (u === 'REI' || u.includes('REISSUE'))              return 'REISSUE'
  if (u === 'PCT')                                        return 'PCT'
  return t || 'CONTINUATION'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const patent = await prisma.patent.findUnique({
    where: { id },
    select: { id: true, patentNumber: true, applicationNumber: true, title: true, jurisdiction: true, epNumber: true }
  })
  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ((patent.jurisdiction || 'US') === 'EP') {
    return NextResponse.json({ parents: [], children: [], note: 'Continuity data not available for EP patents' })
  }

  const appNum = patent.applicationNumber?.replace(/[\/,\s]/g, '')
  if (!appNum) return NextResponse.json({ parents: [], children: [], note: 'No application number' })

  try {
    const res = await fetch(`${ODP_BASE}/${appNum}/continuity`, {
      headers: odpHeaders(),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return NextResponse.json({ parents: [], children: [], error: `ODP returned ${res.status}` })

    const data = await res.json()
    const bag = data.patentFileWrapperDataBag?.[0] || data
    const rawParents: any[] = bag.parentContinuityBag || []
    const rawChildren: any[] = bag.childContinuityBag || []

    // Actual ODP field names differ by role:
    // Parents: parentApplicationNumberText, parentPatentNumber, parentApplicationFilingDate,
    //          parentApplicationStatusDescriptionText, claimParentageTypeCodeDescriptionText
    // Children: childApplicationNumberText, childApplicationFilingDate,
    //           childApplicationStatusDescriptionText, claimParentageTypeCodeDescriptionText

    const enrich = async (entries: any[], role: 'parent' | 'child') => {
      return Promise.all(entries.map(async entry => {
        const rawAppNum  = role === 'parent'
          ? (entry.parentApplicationNumberText || '')
          : (entry.childApplicationNumberText  || '')
        const cleanNum   = rawAppNum.replace(/[\/,\s]/g, '')
        const patentNum  = role === 'parent' ? (entry.parentPatentNumber || null) : null
        const conType    = mapConType(entry.claimParentageTypeCode || entry.claimParentageTypeCodeDescriptionText || '')
        const filingDate = role === 'parent'
          ? (entry.parentApplicationFilingDate || null)
          : (entry.childApplicationFilingDate  || null)
        const statusDesc = role === 'parent'
          ? (entry.parentApplicationStatusDescriptionText || null)
          : (entry.childApplicationStatusDescriptionText  || null)
        const relDesc    = entry.claimParentageTypeCodeDescriptionText || null

        const inDb = await prisma.patent.findFirst({
          where: {
            OR: [
              ...(cleanNum  ? [{ applicationNumber: { contains: cleanNum } }]  : []),
              ...(patentNum ? [{ patentNumber:       { contains: patentNum } }] : []),
            ]
          },
          select: { id: true, title: true, status: true, patentNumber: true, applicationNumber: true }
        })

        return {
          role,
          applicationNumber: rawAppNum,
          patentNumber:      patentNum,
          continuationType:  conType,
          relDescription:    relDesc,
          filingDate,
          statusDescription: statusDesc,
          odpTitle:          null,   // ODP continuity endpoint doesn't return titles
          inDb:              !!inDb,
          dbId:              inDb?.id || null,
          dbTitle:           inDb?.title || null,
          dbStatus:          inDb?.status || null,
          dbPatentNumber:    inDb?.patentNumber || null,
          dbAppNumber:       inDb?.applicationNumber || null,
        }
      }))
    }

    const [parents, children] = await Promise.all([
      enrich(rawParents,  'parent'),
      enrich(rawChildren, 'child'),
    ])

    return NextResponse.json({ parents, children })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
